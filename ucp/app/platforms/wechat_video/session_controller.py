from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import hashlib
import json
import random
import re
import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qs, unquote, urlparse

from PySide6.QtCore import QObject, Signal, Qt, QTimer, QUrl
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile, QWebEngineScript, QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QLabel, QVBoxLayout, QWidget

from app.models import Account
from app.services.auto_reply_runtime import (
    build_comment_test_payload,
    build_dm_test_payload,
    current_time_text,
    dm_first_reply_contents,
    intent_label,
)
from app.services.core_nexus_service import CoreNexusService
from app.services.logger_bus import LoggerBus
from app.services.runtime_policy import RuntimePolicyController

from .http_api import WeChatVideoApiClient
from .dm.recording_runtime import WeChatVideoDMRecordingRuntime
from .comment.recording_runtime import WeChatVideoCommentRecordingRuntime
from .policy import message_from_wx_private, normalize_text, pick_comment_reply_targets
from .runtime import WeChatVideoRuntime



WECHAT_VIDEO_URLS = {
    "dm": "https://channels.weixin.qq.com/platform/private_msg",
    "comment": "https://channels.weixin.qq.com/platform/interaction/comment",
}


# QWebEngine cannot reliably run two independent QWebEngineProfile objects against
# the same persistentStoragePath in one process.  The correct shape for 视频号 is:
#   same finder/account => one in-process QWebEngineProfile + multiple pages/views;
#   different finder/account => different persistent profile directories.
# This preserves the multi-account isolation model while allowing the same account
# to open DM and comment pages simultaneously, just like the stable 抖音 module does
# with independent pages under a stable login context.
_WECHAT_VIDEO_RUNTIME_LOCK = threading.RLock()
_WECHAT_VIDEO_ACTIVE_RUNTIME_BY_FINDER: dict[str, dict[str, Any]] = {}
_WECHAT_VIDEO_SHARED_PROFILE_BY_PATH: dict[str, dict[str, Any]] = {}


class WeChatVideoSessionController(QObject):
    """微信视频号机器人控制器。

    流程与抖音保持一致：先使用 UCP 的独立浏览器 Profile 打开视频号助手目标模块；
    未登录时等待用户登录；登录后从当前浏览器会话提取接口运行参数，再执行迁移
    过来的接口化私信 / 评论处理逻辑。
    """

    state_changed = Signal(str, str)
    title_changed = Signal(str, str)
    auth_confirmed = Signal(str, dict)
    page_template_poll_requested = Signal()
    pre_send_cursor_poll_requested = Signal()

    def __init__(
        self,
        account: Account,
        profile_root,
        logger: LoggerBus,
        *,
        core_service: CoreNexusService | None = None,
        request_logger: Callable[[dict[str, Any]], None] | None = None,
        record_service: Any | None = None,
    ) -> None:
        super().__init__()
        self.account = account
        self.profile_root = profile_root
        self.logger = logger
        self.core_service = core_service
        self.record_service = record_service
        self.runtime_policy = RuntimePolicyController(account, core_service, log=self._log, module="dm")
        self.request_logger = request_logger
        self.module = "dm"
        self._running = False
        self._stop_event = threading.Event()
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix=f"wx-video-{account.id[:8]}")
        self._future = None
        self.profile: QWebEngineProfile | None = None
        self.page: QWebEnginePage | None = None
        self.view: QWebEngineView | None = None
        self._preview_placeholder: QWidget | None = None
        self._shared_profile_key = ""
        self._shared_profile_dir: Path | None = None
        self.target_url = WECHAT_VIDEO_URLS["dm"]
        self._cookies: dict[str, str] = {}
        self._browser_runtime_started = False
        self._interface_generation = 0
        self._interface_paused_for_login = True
        self._login_confirm_candidate_since_ms = 0
        self._last_login_lost_log_ms = 0
        self._last_login_confirm_pending_log_ms = 0
        self._last_prelogin_capture_guard_log_ms = 0
        self._last_wait_log_ms = 0
        self._last_param_wait_log_ms = 0
        self._post_login_redirect_done = False
        self.browser_poll_timer = QTimer(self)
        self.browser_poll_timer.setInterval(2000)
        self.browser_poll_timer.timeout.connect(self._poll_browser_login_state)
        self.page_template_poll_requested.connect(self._maybe_trigger_page_template_poll, Qt.ConnectionType.QueuedConnection)
        self.pre_send_cursor_poll_requested.connect(
            lambda: self._maybe_trigger_cursor_active_poll(force=True),
            Qt.ConnectionType.QueuedConnection,
        )
        self.network_capture_timer = QTimer(self)
        self.network_capture_timer.setInterval(1500)
        self.network_capture_timer.timeout.connect(self._drain_network_capture_queue)
        self._page_message_lock = threading.Lock()
        self._dm_message_event = threading.Event()
        self._page_private_messages: list[dict[str, Any]] = []
        self._dm_session_info_cache: dict[str, dict[str, Any]] = {}
        self._dm_session_info_pending: set[str] = set()
        self._dm_session_info_lock = threading.Lock()
        self._page_poll_template: dict[str, Any] | None = None
        # A page-owned request without a usable CgcI... cursor is only a candidate.
        # It must never mark the DM business session as ready or start long window sleeps.
        self._page_poll_candidate_template: dict[str, Any] | None = None
        self._dm_poll_cookie_by_tab: dict[str, str] = {}
        self._bot_poll_signatures: dict[str, int] = {}
        self._bot_poll_signature_lock = threading.Lock()
        self._page_poll_pending = False
        self._bootstrap_poll_pending = False
        self._last_bootstrap_poll_ms = 0
        self._last_page_poll_ms = 0
        self._cursor_poll_pending = False
        self._last_cursor_poll_ms = 0
        self._cursor_poll_index = 0
        self._last_cursor_active_log_ms = 0
        self._last_tab_trigger_ms = 0
        self._tab_trigger_next = "私信"
        self._tab_trigger_round = 0
        self._dm_tab_bootstrap_retry_count = 0
        self._dm_tab_bootstrap_retry_until_ms = 0
        self._last_template_wait_log_ms = 0
        self._last_template_capture_log_ms = 0
        self._last_login_snapshot_log_ms = 0
        self._last_login_probe_log_ms = 0
        self._last_login_capture_detail_log_ms = 0
        self._active_runtime: WeChatVideoRuntime | None = None
        self._last_capture_log_ms = 0
        self._last_dm_idle_poll_log_ms = 0
        self._last_dm_hard_sleep_log_ms = 0
        self._processed_comment_ids: set[str] = set()
        self._comment_retry_after: dict[str, float] = {}
        self._comment_decision_log_at: dict[str, float] = {}
        self._comment_cooldown_until_monotonic = 0.0
        self._comment_cooldown_reason = ""
        self._comment_last_cooldown_log_monotonic = 0.0
        self._comment_visible_cycle_empty_rounds = 0
        self._processed_dm_ids: set[str] = set()
        self._dm_retry_attempts: dict[str, int] = {}
        self._dm_retry_exhausted_ids: set[str] = set()
        self._dm_aggregate_windows: dict[str, dict[str, Any]] = {}
        self._dm_bootstrap_started_ms = 0
        self._dm_last_business_recovery_ms = 0
        self._dm_business_recovery_count = 0
        self._dm_aggregate_base_wait_ms = 6000
        self._dm_aggregate_max_wait_ms = 8000
        # 页面自然 get-new-msg 响应仍是第一监听源；有效游标主动轮询作为兜底，
        # 每 6 秒轮换一个 Tab（同一 Tab 约 12 秒），避免普通运行冷却造成分钟级延迟。
        self._dm_cursor_poll_interval_ms = 6000
        self._dm_page_template_poll_interval_ms = 10000
        self._dm_tab_refresh_with_cursor_interval_ms = 30000
        self._dm_idle_poll_wait_sec = 6.0
        self._conversation_ids: dict[str, str] = {}
        self._conversation_lookup_miss_at: dict[str, float] = {}
        self._first_reply_done: set[str] = set()
        self._dm_recording = WeChatVideoDMRecordingRuntime(self)
        self._comment_recording = WeChatVideoCommentRecordingRuntime(self)
        self._post_cursor = 0
        self._using_external_runtime = False
        self._external_runtime_owner_id = ""
        self._external_runtime_finder_key = ""
        self.last_state = "未启动"

    def _log(self, level: str, message: str) -> None:
        scope = getattr(self.account, "log_scope", f"{self.account.platform}:{self.account.name} | {self.account.id}")
        self.logger.emit(scope, level, message)

    def _set_state(self, state: str) -> None:
        if self.last_state == state:
            return
        self.last_state = state
        self.state_changed.emit(self.account.id, state)
        self._log("INFO", f"状态切换 -> {state}")

    def _build_preview(self) -> QWidget:
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setContentsMargins(24, 24, 24, 24)
        layout.setSpacing(10)
        title = QLabel("微信视频号助手")
        title.setObjectName("SectionTitle")
        layout.addWidget(title)
        desc = QLabel("启动后将打开视频号助手登录页/目标模块；登录成功后自动进入对应私信或评论模块。")
        desc.setObjectName("PreviewPlaceholder")
        desc.setAlignment(Qt.AlignmentFlag.AlignCenter)
        desc.setWordWrap(True)
        layout.addWidget(desc, 1)
        return widget

    def _build_external_runtime_preview(self) -> QWidget:
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setContentsMargins(24, 24, 24, 24)
        layout.setSpacing(10)
        title = QLabel("微信视频号助手 · 复用同账号登录态")
        title.setObjectName("SectionTitle")
        layout.addWidget(title)
        desc = QLabel(
            "当前机器人正在复用同一视频号账号已打开的浏览器会话执行接口化任务。\n"
            "为避免两个 WebEngine 同时占用同一个视频号登录 Profile 导致网页空白或卡死，"
            "这里不再打开第二个视频号网页；任务会在后台继续运行，日志和接口请求仍会正常记录。"
        )
        desc.setObjectName("PreviewPlaceholder")
        desc.setAlignment(Qt.AlignmentFlag.AlignCenter)
        desc.setWordWrap(True)
        layout.addWidget(desc, 1)
        return widget

    def _shared_profile_key_for_dir(self, profile_dir: Path) -> str:
        try:
            return str(profile_dir.resolve())
        except Exception:
            return str(profile_dir.absolute())

    def _profile_cookie_header(self) -> str:
        return "; ".join(f"{k}={v}" for k, v in self._cookies.items() if k and v)

    def _refresh_active_runtime_from_cookie_map(self) -> None:
        runtime = self._active_runtime
        if runtime is None:
            return
        cookie_header = self._profile_cookie_header()
        if cookie_header:
            runtime.cookie = cookie_header
        wxuin = self._cookies.get("wxuin") or self._cookies.get("uin") or ""
        if wxuin:
            runtime.browser_wxuin = wxuin
            if not runtime.wxuin:
                runtime.wxuin = wxuin
            if not runtime.x_wechat_uin:
                runtime.x_wechat_uin = wxuin
        self._register_active_wechat_runtime(runtime)

    def _merge_active_runtime(self, runtime: WeChatVideoRuntime) -> None:
        """Keep long-running API clients aligned with the shared browser profile.

        When another page for the same 视频号 account refreshes auth cookies, both
        controllers receive cookieAdded signals from the shared profile.  This method
        also merges the periodic browser probe so X-WECHAT-UIN / aid / deviceId do not
        stay stale after a same-account re-login.
        """
        current = self._active_runtime
        if current is None:
            self._active_runtime = runtime
            self._refresh_active_runtime_from_cookie_map()
            return
        for attr in ("aid", "finder_username", "device_id", "wxuin", "x_wechat_uin", "browser_wxuin", "raw_key_buff", "plugin_session_id", "user_agent"):
            value = getattr(runtime, attr, None)
            if value not in (None, ""):
                setattr(current, attr, value)
        if runtime.cookie:
            current.cookie = runtime.cookie
        if runtime.page_url:
            current.page_url = runtime.page_url
        if self._is_valid_message_cursor(runtime.dm_message_cookie):
            current.dm_message_cookie = runtime.dm_message_cookie
            self._persist_valid_dm_cursor(runtime.dm_message_cookie)
        self._refresh_active_runtime_from_cookie_map()

    def _acquire_shared_wechat_profile(self, profile_dir: Path, profile_name: str) -> QWebEngineProfile:
        """Return the single QWebEngineProfile object for this persistent directory.

        Multiple QWebEnginePage instances may safely share one QWebEngineProfile.
        Creating two QWebEngineProfile objects with the same storage path is what made
        the previous build show blank pages / stuck WebEngine views.
        """
        key = self._shared_profile_key_for_dir(profile_dir)
        with _WECHAT_VIDEO_RUNTIME_LOCK:
            entry = _WECHAT_VIDEO_SHARED_PROFILE_BY_PATH.get(key)
            if isinstance(entry, dict) and isinstance(entry.get("profile"), QWebEngineProfile):
                entry["refs"] = int(entry.get("refs") or 0) + 1
                self._shared_profile_key = key
                self._shared_profile_dir = profile_dir
                profile = entry["profile"]
                self._log("INFO", f"微信视频号复用进程内共享 WebEngineProfile：{profile_dir}，refs={entry['refs']}")
                try:
                    profile.cookieStore().cookieAdded.connect(self._on_cookie_added)
                    profile.cookieStore().loadAllCookies()
                except Exception:
                    pass
                return profile

            parent = QApplication.instance()
            profile = QWebEngineProfile(profile_name, parent)
            profile.setPersistentStoragePath(str(profile_dir))
            profile.setCachePath(str(profile_dir / "cache"))
            try:
                profile.setHttpCacheType(QWebEngineProfile.HttpCacheType.DiskHttpCache)
            except Exception:
                pass
            try:
                profile.setPersistentCookiesPolicy(QWebEngineProfile.PersistentCookiesPolicy.ForcePersistentCookies)
            except Exception:
                try:
                    profile.setPersistentCookiesPolicy(QWebEngineProfile.ForcePersistentCookies)
                except Exception:
                    pass
            profile.setHttpUserAgent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 MatrixFlow/1.0"
            )
            try:
                profile.cookieStore().cookieAdded.connect(self._on_cookie_added)
                profile.cookieStore().loadAllCookies()
            except Exception:
                pass
            _WECHAT_VIDEO_SHARED_PROFILE_BY_PATH[key] = {
                "profile": profile,
                "refs": 1,
                "path": str(profile_dir),
                "created_at": time.time(),
            }
            self._shared_profile_key = key
            self._shared_profile_dir = profile_dir
            self._log("INFO", f"微信视频号创建账号级共享 WebEngineProfile：{profile_dir}，refs=1")
            return profile

    def _release_shared_wechat_profile(self) -> None:
        key = self._shared_profile_key
        self._shared_profile_key = ""
        self._shared_profile_dir = None
        if not key:
            return
        profile_to_delete = None
        with _WECHAT_VIDEO_RUNTIME_LOCK:
            entry = _WECHAT_VIDEO_SHARED_PROFILE_BY_PATH.get(key)
            if not isinstance(entry, dict):
                return
            refs = max(0, int(entry.get("refs") or 0) - 1)
            entry["refs"] = refs
            if refs <= 0:
                profile_to_delete = entry.get("profile")
                _WECHAT_VIDEO_SHARED_PROFILE_BY_PATH.pop(key, None)
        if isinstance(profile_to_delete, QWebEngineProfile):
            try:
                profile_to_delete.deleteLater()
            except Exception:
                pass

    def _profile_score(self, path: Path) -> int:
        """Score a WebEngine profile by durable auth storage, not transient cache.

        The previous implementation counted GPUCache/cache folders. A cache-only
        directory can outscore the real logged-in profile and make the next startup
        open an effectively fresh profile, which is one cause of repeated QR login.
        """
        if not path.exists():
            return 0
        score = 1
        weighted_markers = [
            (path / "Cookies", 80),
            (path / "Network" / "Cookies", 100),
            (path / "Local Storage", 80),
            (path / "IndexedDB", 40),
            (path / "Session Storage", 25),
        ]
        for marker, weight in weighted_markers:
            try:
                if not marker.exists():
                    continue
                if marker.is_file():
                    size = marker.stat().st_size
                    if size > 0:
                        score += weight + min(size // 1024, 300)
                else:
                    file_count = 0
                    total_size = 0
                    for item in marker.rglob("*"):
                        if item.is_file():
                            file_count += 1
                            try:
                                total_size += item.stat().st_size
                            except Exception:
                                pass
                    if file_count:
                        score += weight + min(file_count * 5, 120) + min(total_size // 4096, 180)
            except Exception:
                pass
        return score

    def _profile_mtime(self, path: Path) -> float:
        if not path.exists():
            return 0.0
        latest = 0.0
        try:
            latest = max(latest, path.stat().st_mtime)
        except Exception:
            pass
        for marker in (path / "Cookies", path / "Network" / "Cookies", path / "Local Storage", path / "IndexedDB", path / "Session Storage"):
            try:
                if marker.is_file():
                    latest = max(latest, marker.stat().st_mtime)
                elif marker.exists():
                    for item in marker.rglob("*"):
                        if item.is_file():
                            try:
                                latest = max(latest, item.stat().st_mtime)
                            except Exception:
                                pass
            except Exception:
                pass
        return latest

    def _extract_json_objects(self, value: Any) -> list[Any]:
        items: list[Any] = []
        if isinstance(value, (dict, list)):
            items.append(value)
        elif isinstance(value, str) and value.strip():
            try:
                parsed = json.loads(value)
                if isinstance(parsed, (dict, list)):
                    items.append(parsed)
            except Exception:
                pass
        return items

    def _wechat_finder_identity(self) -> str:
        """Return the stable 视频号 finderUsername for cross-module profile sharing.

        微信视频号的 wxuin / X-WECHAT-UIN can change after a fresh QR login.  If DM and
        comment robots keep separate auth_id profiles, scanning the same account in the
        second module can invalidate the first module's session and make it redirect to
        login.html.  The durable account identity is finderUsername (v2_...@finder), so
        only that value is used for the shared profile key when available.
        """
        candidates: list[str] = []
        for value in (self.account.auth_name, self.account.auth_uid):
            if value:
                candidates.append(str(value))

        def walk(obj: Any, depth: int = 0) -> None:
            if depth > 7:
                return
            if isinstance(obj, dict):
                for key, child in obj.items():
                    key_s = str(key)
                    if re.search(r"finder(username|_username)?|finderId|finder_id|_log_finder_id|accountName", key_s, re.I):
                        if isinstance(child, (str, int, float)):
                            candidates.append(str(child))
                    if isinstance(child, str) and child.strip().startswith(("{", "[")):
                        for parsed in self._extract_json_objects(child):
                            walk(parsed, depth + 1)
                    elif isinstance(child, (dict, list)):
                        walk(child, depth + 1)
            elif isinstance(obj, list):
                for child in obj[:60]:
                    if isinstance(child, str) and child.strip().startswith(("{", "[")):
                        for parsed in self._extract_json_objects(child):
                            walk(parsed, depth + 1)
                    elif isinstance(child, (dict, list)):
                        walk(child, depth + 1)

        for root in (self.account.config, self.account.session_data):
            for obj in self._extract_json_objects(root):
                walk(obj)

        for text in candidates:
            value = str(text or "").strip()
            if not value:
                continue
            # finderUsername observed in video号 assistant is v2_...@finder.
            if "@finder" in value or re.match(r"^v[0-9]+_[A-Za-z0-9_-]{20,}$", value):
                return value
        return ""

    def _wechat_runtime_finder_key(self, runtime: WeChatVideoRuntime | None = None) -> str:
        finder = ""
        if runtime is not None:
            finder = str(runtime.finder_username or "").strip()
        if not finder:
            finder = self._wechat_finder_identity()
        if not finder:
            return ""
        return hashlib.sha1(finder.encode("utf-8", errors="ignore")).hexdigest()[:16]

    def _clone_runtime_for_module(self, runtime: WeChatVideoRuntime, module: str) -> WeChatVideoRuntime:
        page_url = "https://channels.weixin.qq.com/micro/interaction/comment" if module == "comment" else "https://channels.weixin.qq.com/micro/interaction/private_msg"
        raw = dict(runtime.raw or {})
        raw["sharedFromRobotId"] = raw.get("sharedFromRobotId") or getattr(self.account, "id", "")
        return WeChatVideoRuntime(
            aid=runtime.aid,
            finder_username=runtime.finder_username,
            device_id=runtime.device_id,
            wxuin=runtime.wxuin,
            cookie=runtime.cookie,
            page_url=page_url,
            raw=raw,
            x_wechat_uin=runtime.x_wechat_uin,
            browser_wxuin=runtime.browser_wxuin,
            dm_message_cookie=runtime.dm_message_cookie,
            raw_key_buff=runtime.raw_key_buff,
            plugin_session_id=runtime.plugin_session_id,
            user_agent=runtime.user_agent,
        )

    def _borrow_active_wechat_runtime(self, module: str) -> tuple[WeChatVideoRuntime, str] | None:
        """Reuse a same-finder browser runtime without opening a second WebEngine profile.

        The previous shared-profile approach solved repeated QR login but made Qt
        WebEngine blank/freeze when DM and comment both created QWebEngineProfile
        objects using the same persistent directory.  Borrowing only the runtime
        (aid/cookie/device/finder) keeps one browser owner and lets the second
        module run through the existing authenticated interface session.
        """
        key = self._wechat_runtime_finder_key()
        if not key:
            return None
        with _WECHAT_VIDEO_RUNTIME_LOCK:
            entry = _WECHAT_VIDEO_ACTIVE_RUNTIME_BY_FINDER.get(key)
            if not isinstance(entry, dict):
                return None
            owner = entry.get("owner")
            owner_id = str(entry.get("owner_id") or "")
            runtime = entry.get("runtime")
            if owner is self or owner_id == self.account.id:
                return None
            if owner is None or not getattr(owner, "is_running", lambda: False)():
                _WECHAT_VIDEO_ACTIVE_RUNTIME_BY_FINDER.pop(key, None)
                return None
            if not isinstance(runtime, WeChatVideoRuntime):
                return None
            if not runtime.aid or not runtime.device_id or not (runtime.x_wechat_uin or runtime.wxuin) or not runtime.cookie:
                return None
            return self._clone_runtime_for_module(runtime, module), owner_id

    def _register_active_wechat_runtime(self, runtime: WeChatVideoRuntime) -> None:
        if self._using_external_runtime:
            return
        key = self._wechat_runtime_finder_key(runtime)
        if not key:
            return
        with _WECHAT_VIDEO_RUNTIME_LOCK:
            _WECHAT_VIDEO_ACTIVE_RUNTIME_BY_FINDER[key] = {
                "owner": self,
                "owner_id": self.account.id,
                "module": self.module,
                "runtime": runtime,
                "updated_at": time.time(),
            }

    def _unregister_active_wechat_runtime(self) -> None:
        key = self._wechat_runtime_finder_key(self._active_runtime)
        if not key:
            key = self._external_runtime_finder_key
        if not key:
            return
        with _WECHAT_VIDEO_RUNTIME_LOCK:
            entry = _WECHAT_VIDEO_ACTIVE_RUNTIME_BY_FINDER.get(key)
            if isinstance(entry, dict) and entry.get("owner") is self:
                _WECHAT_VIDEO_ACTIVE_RUNTIME_BY_FINDER.pop(key, None)

    def _wechat_account_profile_dir(self) -> Path:
        platform_dir = self.profile_root / self.account.platform.lower()
        finder = self._wechat_finder_identity()
        if finder:
            digest = hashlib.sha1(finder.encode("utf-8", errors="ignore")).hexdigest()[:16]
            return platform_dir / f"finder_{digest}"
        # 首次授权前通常还没有 finder/auth_uid。私信和评论如果是同一个账号、
        # 同一个机器人名称，必须先落到 name_* 共享目录，才能做到视频号只扫码一次。
        # 运行实例、页面、日志仍然按 robot_id 隔离；这里只共享浏览器登录态。
        return self.account.shared_login_profile_dir(self.profile_root)

    def _candidate_wechat_profile_dirs(self, stable_dir: Path) -> list[Path]:
        platform_dir = self.profile_root / self.account.platform.lower()
        raw_keys = [
            self.account.name,
            self.account.auth_id,
            self.account.id,
            self.account.auth_uid,
            self.account.auth_name,
            self.account.device_id,
            self._wechat_finder_identity(),
        ]
        candidates: list[Path] = []
        def add(path: Path) -> None:
            if path not in candidates:
                candidates.append(path)
        add(stable_dir)
        add(self.account.shared_login_profile_dir(self.profile_root))
        add(self.account.profile_dir(self.profile_root))
        for raw_key in raw_keys:
            if not raw_key:
                continue
            safe_key = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in str(raw_key)).strip("_")
            if not safe_key:
                continue
            for prefix in ("name", "auth", "robot", "finder"):
                add(platform_dir / f"{prefix}_{safe_key}")
        return candidates

    def _select_wechat_profile_dir(self) -> Path:
        stable_dir = self._wechat_account_profile_dir()
        if self.account.platform != "WECHAT_VIDEO":
            return stable_dir
        profile_kind = "账号级共享" if self._wechat_finder_identity() else "稳定登录"

        candidates = self._candidate_wechat_profile_dirs(stable_dir)
        stable_score = self._profile_score(stable_dir)
        scored = []
        for path in candidates:
            if not path.exists():
                continue
            score = self._profile_score(path)
            if score <= 1:
                continue
            scored.append((score, self._profile_mtime(path), path))

        if stable_score > 1:
            final_score = stable_score
            self._log("INFO", f"微信视频号复用{profile_kind} Profile：{stable_dir}，score={final_score}")
            return stable_dir

        # First run after upgrading from auth_id/robot_id profiles: migrate a real
        # logged-in legacy profile into the finder-level shared directory.  For 视频号,
        # the most recently written auth storage is usually more trustworthy than a
        # larger stale cache because scanning the same account in another module can
        # invalidate the older session.
        scored.sort(key=lambda item: (item[1], item[0]), reverse=True)
        best_score, best_mtime, best_dir = scored[0] if scored else (0, 0.0, stable_dir)

        if best_dir != stable_dir and best_score > 1:
            try:
                stable_dir.parent.mkdir(parents=True, exist_ok=True)
                backup_dir = stable_dir.with_name(stable_dir.name + f".backup_{int(time.time())}")
                if stable_dir.exists() and stable_score > 1:
                    shutil.move(str(stable_dir), str(backup_dir))
                elif stable_dir.exists():
                    shutil.rmtree(stable_dir, ignore_errors=True)
                shutil.copytree(best_dir, stable_dir)
                self._log("INFO", f"已迁移微信视频号登录 Profile 到{profile_kind}目录：{best_dir.name} -> {stable_dir.name}，score={best_score}")
            except Exception as exc:
                self._log("WARN", f"迁移微信视频号登录 Profile 失败，临时复用旧目录：{type(exc).__name__}: {str(exc)[:140]}")
                return best_dir

        final_score = self._profile_score(stable_dir)
        if final_score > 1:
            self._log("INFO", f"微信视频号复用{profile_kind} Profile：{stable_dir}，score={final_score}")
        return stable_dir

    def _ensure_view(self) -> QWebEngineView:
        if self.view is not None:
            return self.view
        profile_dir = self._select_wechat_profile_dir()
        profile_dir.mkdir(parents=True, exist_ok=True)
        self._log("INFO", f"微信视频号浏览器 Profile 目录：{profile_dir}")
        profile_name = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in str(profile_dir.name or self.account.id))

        self.view = QWebEngineView()
        self.profile = self._acquire_shared_wechat_profile(profile_dir, profile_name)

        # Page is owned by the view/controller, while the profile is shared and outlives
        # individual pages.  This allows DM + comment to display simultaneously under
        # one login profile without two profiles fighting over the same disk path.
        self.page = QWebEnginePage(self.profile, self.view)
        self._install_network_capture_user_script()
        self.page.titleChanged.connect(lambda title: self.title_changed.emit(self.account.id, title))
        self.page.urlChanged.connect(self._on_page_url_changed)
        self.page.loadFinished.connect(self._on_page_load_finished)
        settings = self.page.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.PluginsEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.ScrollAnimatorEnabled, True)
        self.view.setPage(self.page)
        self.view.setZoomFactor(1.0)
        self.view.setMinimumSize(1100, 760)
        return self.view

    def _on_cookie_added(self, cookie: Any) -> None:
        try:
            name = bytes(cookie.name()).decode("utf-8", errors="ignore")
            value = bytes(cookie.value()).decode("utf-8", errors="ignore")
            if name:
                self._cookies[name] = value
                self._refresh_active_runtime_from_cookie_map()
        except Exception:
            pass

    def _network_capture_hook_js(self) -> str:
        return r"""
(() => {
  try {
    if (window.__ucpWechatVideoCaptureInstalled) {
      return 'already';
    }
    window.__ucpWechatVideoCaptureInstalled = true;
    const getSharedQueue = () => {
      try {
        if (window.top && window.top !== window && window.top.location && window.top.location.origin === location.origin) {
          window.top.__ucpWechatVideoCaptureQueue = window.top.__ucpWechatVideoCaptureQueue || [];
          return window.top.__ucpWechatVideoCaptureQueue;
        }
      } catch (e) {}
      window.__ucpWechatVideoCaptureQueue = window.__ucpWechatVideoCaptureQueue || [];
      return window.__ucpWechatVideoCaptureQueue;
    };
    getSharedQueue();
    const normalizeUrl = (url) => {
      try { return new URL(String(url || ''), location.href).href; } catch (e) { return String(url || ''); }
    };
    const shouldCapture = (url) => {
      const raw = String(url || '');
      const u = normalizeUrl(raw);
      // 视频号业务页经常用相对路径 /micro/interaction/... 发起请求；
      // 如果只匹配完整域名，会漏掉页面自己触发的真实 get-new-msg / get-session-info。
      if (!u.includes('channels.weixin.qq.com') && !raw.includes('/micro/interaction/')) return false;
      return u.includes('/private-msg/get-new-msg')
        || u.includes('/private-msg/get-session-info')
        || u.includes('/private-msg/send-private-msg');
    };
    const normalizeHeaders = (headers) => {
      const out = {};
      try {
        if (!headers) return out;
        if (headers instanceof Headers) {
          headers.forEach((v, k) => { out[k] = String(v); });
        } else if (Array.isArray(headers)) {
          headers.forEach((pair) => {
            if (pair && pair.length >= 2) out[String(pair[0])] = String(pair[1]);
          });
        } else if (typeof headers === 'object') {
          Object.keys(headers).forEach((k) => { out[k] = String(headers[k]); });
        }
      } catch (e) {}
      return out;
    };
    const detectPrivateMsgTab = () => {
      const norm = (v) => String(v || '').replace(/\s+/g, '');
      const labelOf = (value) => {
        const text = norm(value);
        for (const label of ['私信', '打招呼消息']) {
          if (text === label) return label;
          if (text.startsWith(label)) {
            const suffix = text.slice(label.length);
            if (suffix.length <= 8 && /^[0-9+()（）未读]*$/.test(suffix)) return label;
          }
        }
        return '';
      };
      const selectedLike = (el) => {
        let cur = el;
        for (let i = 0; cur && i < 5; i++, cur = cur.parentElement) {
          if (String(cur.getAttribute && cur.getAttribute('aria-selected') || '').toLowerCase() === 'true') return true;
          if (/active|selected|current/i.test(String(cur.className || ''))) return true;
        }
        return false;
      };
      try {
        const nodes = Array.from(document.querySelectorAll('[role="tab"], [aria-selected], [class*="active"], [class*="selected"], li, button, a, span'));
        for (const el of nodes) {
          const label = labelOf(el.innerText || el.textContent || el.getAttribute('aria-label') || '');
          if (label && selectedLike(el)) return label;
        }
      } catch (e) {}
      return '';
    };
    const pushRecord = (record) => {
      try {
        const q = getSharedQueue();
        q.push({
          capturedAt: Date.now(),
          pageUrl: location.href,
          frameUrl: location.href,
          isTopFrame: window.top === window,
          title: document.title || '',
          ...record,
          tab: record && record.tab ? record.tab : detectPrivateMsgTab(),
        });
        if (q.length > 300) q.splice(0, q.length - 300);
      } catch (e) {}
    };

    if (window.fetch && !window.__ucpWechatFetchWrapped) {
      window.__ucpWechatFetchWrapped = true;
      const rawFetch = window.fetch.bind(window);
      try { window.__ucpWechatRawFetch = rawFetch; } catch (e) {}
      window.fetch = async function(input, init) {
        const rawUrl = typeof input === 'string' ? input : (input && input.url) || '';
        const url = normalizeUrl(rawUrl);
        const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        const reqHeaders = normalizeHeaders((init && init.headers) || (input && input.headers));
        const reqBody = init && init.body ? String(init.body) : '';
        const startedAt = Date.now();
        const response = await rawFetch(input, init);
        if (shouldCapture(url)) {
          try {
            const cloned = response.clone();
            cloned.text().then((text) => {
              pushRecord({
                source: reqHeaders['X-UCP-Bootstrap-Poll'] || reqHeaders['x-ucp-bootstrap-poll'] ? 'page_bootstrap_poll' : (reqHeaders['X-UCP-Bot-Poll'] || reqHeaders['x-ucp-bot-poll'] ? 'page_fetch_poll' : 'fetch'),
                method,
                url,
                status: response.status,
                durationMs: Date.now() - startedAt,
                requestHeaders: reqHeaders,
                requestBody: reqBody,
                responseText: text || '',
              });
            }).catch((err) => {
              pushRecord({source: 'fetch', method, url, status: response.status, durationMs: Date.now() - startedAt, requestHeaders: reqHeaders, requestBody: reqBody, responseText: '', error: String(err)});
            });
          } catch (e) {}
        }
        return response;
      };
    }

    if (window.XMLHttpRequest && !window.__ucpWechatXHRWrapped) {
      window.__ucpWechatXHRWrapped = true;
      const rawOpen = XMLHttpRequest.prototype.open;
      const rawSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
      const rawSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url) {
        this.__ucpWechat = { method: String(method || 'GET').toUpperCase(), url: normalizeUrl(url), rawUrl: String(url || ''), headers: {}, body: '', startedAt: 0 };
        return rawOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.setRequestHeader = function(key, value) {
        try {
          if (this.__ucpWechat) this.__ucpWechat.headers[String(key)] = String(value);
        } catch (e) {}
        return rawSetRequestHeader.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function(body) {
        try {
          if (this.__ucpWechat) {
            this.__ucpWechat.body = body ? String(body) : '';
            this.__ucpWechat.startedAt = Date.now();
            this.addEventListener('loadend', () => {
              const meta = this.__ucpWechat || {};
              if (!shouldCapture(meta.url)) return;
              let text = '';
              try { text = this.responseText || ''; } catch (e) {}
              pushRecord({
                source: meta.headers && (meta.headers['X-UCP-Bootstrap-Poll'] || meta.headers['x-ucp-bootstrap-poll']) ? 'page_bootstrap_poll' : (meta.headers && (meta.headers['X-UCP-Bot-Poll'] || meta.headers['x-ucp-bot-poll']) ? 'page_fetch_poll' : 'xhr'),
                method: meta.method || 'GET',
                url: meta.url || '',
                status: this.status || 0,
                durationMs: Date.now() - (meta.startedAt || Date.now()),
                requestHeaders: meta.headers || {},
                requestBody: meta.body || '',
                responseText: text,
              });
            });
          }
        } catch (e) {}
        return rawSend.apply(this, arguments);
      };
    }
    return 'installed';
  } catch (err) {
    return 'error:' + String(err);
  }
})()
"""

    def _install_network_capture_user_script(self) -> None:
        if self.page is None:
            return
        try:
            script = QWebEngineScript()
            script.setName("ucp-wechat-video-network-capture")
            script.setSourceCode(self._network_capture_hook_js())
            script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
            # 视频号助手的业务页面可能运行在子 frame 中；泡泡自动化的 page.on("response")
            # 能捕获所有 frame 的请求，所以这里也必须覆盖子 frame，否则会一直捕获不到真实
            # get-new-msg 模板，只能等待 page_template_wait。
            script.setRunsOnSubFrames(True)
            try:
                script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
            except Exception:
                pass
            self.page.scripts().insert(script)
            self._log("INFO", "视频号页面网络监听已注册为 DocumentCreation 脚本。")
        except Exception as exc:
            self._log("WARN", f"注册视频号页面网络监听脚本失败：{type(exc).__name__}: {str(exc)[:140]}")

    def _is_wechat_video_login_url(self, url: str) -> bool:
        text = str(url or "").lower()
        return bool("login" in text or "passport" in text or "/cgi-bin/login" in text)

    def _on_page_url_changed(self, url: QUrl) -> None:
        text = url.toString() if url is not None else ""
        self._log("INFO", f"视频号页面地址变化: {text}")
        if self._is_wechat_video_login_url(text):
            self._pause_interface_for_login(reason="url_changed_to_login", url=text)

    def _interface_loop_active(self, generation: int | None = None) -> bool:
        if not self._running or self._stop_event.is_set():
            return False
        if generation is not None and int(generation) != int(getattr(self, "_interface_generation", 0) or 0):
            return False
        if bool(getattr(self, "_interface_paused_for_login", True)):
            return False
        if not bool(getattr(self, "_browser_runtime_started", False)):
            return False
        return True

    def _clear_wechat_video_interface_pending_state(self) -> None:
        self._page_poll_pending = False
        self._bootstrap_poll_pending = False
        self._cursor_poll_pending = False
        self._dm_message_event.set()
        with self._page_message_lock:
            self._page_private_messages.clear()
        if self.module == "dm":
            self._dm_aggregate_windows.clear()

    def _pause_interface_for_login(self, *, reason: str, url: str = "") -> None:
        """Pause all active interface work when the browser is not authenticated.

        The page may reach /platform briefly before WeChat redirects an expired profile
        back to login.html.  In that window we must not keep the old API loop alive or
        trigger private-message tab/bootstrap requests.  Manual logout after a successful
        run follows the same path: state returns to 待登录 and business loops exit by
        generation mismatch, while the browser remains open for re-login.
        """
        if not self._running:
            return
        was_started = bool(getattr(self, "_browser_runtime_started", False))
        was_unpaused = not bool(getattr(self, "_interface_paused_for_login", True))
        if was_started or was_unpaused:
            self._interface_generation += 1
        self._browser_runtime_started = False
        self._interface_paused_for_login = True
        self._login_confirm_candidate_since_ms = 0
        self._unregister_active_wechat_runtime()
        self._active_runtime = None
        self._clear_wechat_video_interface_pending_state()
        self._set_state("待登录")
        now_ms = int(time.monotonic() * 1000)
        if (was_started or was_unpaused) and now_ms - self._last_login_lost_log_ms > 5000:
            self._last_login_lost_log_ms = now_ms
            self._log("WARN", f"检测到微信视频号未登录/已回到扫码页，已暂停接口化处理和业务巡检：reason={reason} url={str(url)[:180]}")

    def _on_page_load_finished(self, ok: bool) -> None:
        url = self.page.url().toString() if self.page else ""
        self._log("INFO", f"视频号页面加载完成: ok={ok}，URL={url}")
        if ok:
            if self._is_wechat_video_login_url(url):
                self._pause_interface_for_login(reason="load_finished_login_page", url=url)
                return
            self._install_network_capture_hook()
            if self.module == "dm" and "private_msg" in url and self._interface_loop_active():
                # The private-msg iframe often renders its sub tabs slightly after
                # loadFinished. Queue several forced bootstrap attempts so a transient
                # tab_not_found result cannot put the worker into a long window sleep.
                QTimer.singleShot(800, lambda: self._trigger_page_dm_tab_refresh(force=True, target="私信"))
                QTimer.singleShot(2600, lambda: self._trigger_page_dm_tab_refresh(force=True, target="打招呼消息"))
                QTimer.singleShot(5200, lambda: self._trigger_page_dm_tab_refresh(force=True))

    def _install_network_capture_hook(self) -> None:
        if self.page is None:
            return
        self.page.runJavaScript(
            self._network_capture_hook_js(),
            lambda result: self._log("INFO", f"视频号页面网络监听注入结果：{result}") if result not in (None, "already") else None,
        )

    def _drain_network_capture_queue(self) -> None:
        if not self._running or self.page is None:
            return
        if not self._interface_loop_active():
            now_ms = int(time.monotonic() * 1000)
            if now_ms - self._last_prelogin_capture_guard_log_ms > 30000:
                self._last_prelogin_capture_guard_log_ms = now_ms
                self._log("INFO", "视频号未登录/待登录：网络捕获队列仅保留浏览器状态探测，暂停页面接口轮询触发。")
            self._clear_wechat_video_interface_pending_state()
            return
        self._install_network_capture_hook()
        script = r"""
(() => {
  try {
    const seen = new Set();
    const items = [];
    const drainWindow = (w) => {
      try {
        if (!w || seen.has(w)) return;
        seen.add(w);
        const q = w.__ucpWechatVideoCaptureQueue || [];
        const part = q.splice(0, 120);
        for (const item of part) items.push(item);
        const frames = w.frames || [];
        for (let i = 0; i < frames.length; i++) {
          try { drainWindow(frames[i]); } catch (e) {}
        }
      } catch (e) {}
    };
    drainWindow(window);
    if (items.length > 160) items.splice(0, items.length - 160);
    return JSON.stringify(items);
  } catch (e) {
    return JSON.stringify([{source:'capture_error', error:String(e)}]);
  }
})()
"""
        self.page.runJavaScript(script, self._handle_network_capture_records)
        self._maybe_trigger_page_template_poll()

    def _safe_json_loads(self, value: Any) -> Any:
        if isinstance(value, (dict, list)):
            return value
        if not isinstance(value, str):
            return value
        try:
            return json.loads(value)
        except Exception:
            return value

    def _mask_capture_headers(self, headers: Any) -> dict[str, Any]:
        if not isinstance(headers, dict):
            return {}
        safe = dict(headers)
        for key in list(safe.keys()):
            low = str(key).lower()
            if low in {"cookie", "authorization", "x-wechat-uin"}:
                safe[key] = "***"
        return safe

    def _is_valid_message_cursor(self, value: Any) -> bool:
        text = str(value or "").strip()
        # CgAKAA== is the short empty/default cursor observed in failed UCP polling;
        # using it repeatedly makes get-new-msg return errCode=0 with msg=[].
        if not text or text == "CgAKAA==":
            return False
        return len(text) > 10

    def _persist_valid_dm_cursor(self, cursor: str, tab: str | None = None) -> None:
        if not self._is_valid_message_cursor(cursor):
            return
        if tab in {"私信", "打招呼消息"}:
            self._dm_poll_cookie_by_tab[str(tab)] = cursor
        # 视频号私信游标本质上是 get-new-msg 的消息同步 cursor。
        # 旧泡泡实现按 tab 维护 pollCookieByTab；UCP 这边如果只捕获到其中一个 tab 的
        # CgcI... 游标，另一个 tab 也必须先能启动主动轮询，否则会一直停在
        # page_template_wait，看起来像“拿到游标但不处理新消息”。
        for name in ("私信", "打招呼消息"):
            if not self._is_valid_message_cursor(self._dm_poll_cookie_by_tab.get(name)):
                self._dm_poll_cookie_by_tab[name] = cursor
        if self._active_runtime is not None:
            self._active_runtime.dm_message_cookie = cursor
            self._register_active_wechat_runtime(self._active_runtime)
        # A real page-derived cursor proves that the inner private-message business
        # session is ready. Clear degraded bootstrap recovery state immediately.
        self._dm_business_recovery_count = 0
        self._dm_bootstrap_started_ms = 0
        # Best-effort browser storage persistence so the next launch has the latest
        # page-derived cursor available before the first official page response.
        if self.page is not None:
            script = "try { localStorage.setItem('dm_message_cookie', %s); localStorage.setItem('ucp_dm_message_cookie', %s); } catch(e) {}" % (
                json.dumps(cursor, ensure_ascii=False),
                json.dumps(cursor, ensure_ascii=False),
            )
            try:
                self.page.runJavaScript(script)
            except Exception:
                pass

    def _cursor_digest(self, value: Any) -> str:
        text = str(value or "")
        if not text:
            return "-"
        if len(text) <= 12:
            return f"{text}({len(text)})"
        return f"{text[:6]}...{text[-4:]}({len(text)})"

    def _canonical_request_body_text(self, value: Any) -> str:
        if isinstance(value, str):
            return value
        try:
            return json.dumps(value if value is not None else {}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        except Exception:
            return str(value or "")

    def _bot_poll_signature(self, url: Any, method: Any, body: Any) -> str:
        raw = (str(method or "POST").upper() + "\n" + str(url or "") + "\n" + self._canonical_request_body_text(body)).encode("utf-8", errors="ignore")
        return hashlib.sha256(raw).hexdigest()[:24]

    def _track_page_bot_poll(self, url: str, method: str, body: Any, ttl_ms: int = 30000) -> None:
        sig = self._bot_poll_signature(url, method, body)
        expires = int(time.monotonic() * 1000) + max(1000, int(ttl_ms or 0))
        with self._bot_poll_signature_lock:
            self._bot_poll_signatures[sig] = expires
            if len(self._bot_poll_signatures) > 200:
                now = int(time.monotonic() * 1000)
                self._bot_poll_signatures = {k: v for k, v in self._bot_poll_signatures.items() if v > now}

    def _is_tracked_page_bot_poll(self, record: dict[str, Any], request_body: Any) -> bool:
        source = str(record.get("source") or "")
        if source.startswith("page_bootstrap_poll") or source.startswith("page_fetch_poll") or source.startswith("page_cursor_poll"):
            return True
        sig = self._bot_poll_signature(record.get("url"), record.get("method") or "POST", request_body)
        now = int(time.monotonic() * 1000)
        with self._bot_poll_signature_lock:
            exp = self._bot_poll_signatures.get(sig) or 0
            if exp and exp > now:
                return True
            if exp:
                self._bot_poll_signatures.pop(sig, None)
        return False

    def _dm_cursor_for_tab(self, tab: str) -> str:
        tab = tab if tab in {"私信", "打招呼消息"} else "私信"
        cursor = self._dm_poll_cookie_by_tab.get(tab) or ""
        if not self._is_valid_message_cursor(cursor) and self._active_runtime is not None:
            cursor = self._active_runtime.dm_message_cookie or ""
        return cursor if self._is_valid_message_cursor(cursor) else ""

    def _has_any_valid_dm_cursor(self) -> bool:
        if self._active_runtime is not None and self._is_valid_message_cursor(self._active_runtime.dm_message_cookie):
            return True
        return any(self._is_valid_message_cursor(v) for v in self._dm_poll_cookie_by_tab.values())

    def _has_queued_dm_messages(self) -> bool:
        """Return whether page response capture has real messages waiting for the worker."""
        try:
            with self._page_message_lock:
                return bool(self._page_private_messages)
        except Exception:
            return False

    def _dm_cursor_bootstrap_in_progress(self) -> bool:
        """True while WeChat DM is still discovering the page-owned get-new-msg cursor/template.

        Windowed runtime policy must not put the worker into a 15~30 minute sleep
        before this bootstrap has completed. Otherwise the private-message page may
        miss its first tab switch/template response and look like the old stable
        tab-click logic was broken. This guard only affects WeChat DM bootstrap and
        in-flight aggregate work; normal window intervals still apply after cursor
        or template discovery succeeds.
        """
        if getattr(self, "module", "") != "dm" or not self._running:
            return False
        if getattr(self, "_dm_aggregate_windows", None):
            return True
        if self._page_poll_pending or self._bootstrap_poll_pending or self._cursor_poll_pending:
            return True
        if not self._browser_runtime_started:
            # During login/module mount we still need short page probes; a long
            # schedule sleep here can leave the page on login/private_msg without
            # running the post-login tab/template bootstrap.
            return True
        # Capturing a URL/headers template is not enough. CgAKAA== and an absent
        # request cursor are the empty/default state observed when the outer page is
        # logged in but the inner private-message business session is not initialized.
        if not self._has_any_valid_dm_cursor():
            return True
        return False

    def _dm_can_record_window_scan(self, *, source: str, raw_messages: list[Any], messages: list[Any], due_messages: list[Any]) -> bool:
        if getattr(self, "module", "") != "dm":
            return True
        if getattr(self, "_dm_aggregate_windows", None):
            return False
        if raw_messages or messages or due_messages:
            return True
        # Only mark an empty scan complete after the page cursor/template has actually
        # been established. A startup tick with source=page_template_wait/page_cursor_poll
        # and no cursor must stay on short bootstrap cadence, not enter window sleep.
        if self._has_any_valid_dm_cursor():
            return True
        return False

    def _schedule_dm_tab_bootstrap_retry(self, *, delay_ms: int = 2500, reason: str = "tab_not_found") -> None:
        if not self._running or self.module != "dm" or self.page is None:
            return
        now = int(time.monotonic() * 1000)
        if self._has_any_valid_dm_cursor():
            self._dm_tab_bootstrap_retry_count = 0
            self._dm_tab_bootstrap_retry_until_ms = 0
            return
        if not self._dm_tab_bootstrap_retry_until_ms:
            self._dm_tab_bootstrap_retry_until_ms = now + 180000
        if now > self._dm_tab_bootstrap_retry_until_ms:
            return
        if self._dm_tab_bootstrap_retry_count >= 40:
            return
        self._dm_tab_bootstrap_retry_count += 1
        target = self._tab_trigger_next if self._tab_trigger_next in {"私信", "打招呼消息"} else "私信"
        QTimer.singleShot(max(500, int(delay_ms)), lambda: self._trigger_page_dm_tab_refresh(force=True, target=target))

    def _capture_url_summary(self, url: str) -> dict[str, Any]:
        try:
            parsed = urlparse(str(url or ""))
            query = parse_qs(parsed.query)
            page_url = unquote((query.get("_pageUrl") or [""])[0])
            return {
                "host": parsed.netloc,
                "path": parsed.path,
                "_aid": (query.get("_aid") or [""])[0],
                "_rid": self._snapshot_value((query.get("_rid") or [""])[0], max_len=32),
                "_pageUrl": page_url[:180],
            }
        except Exception:
            return {"raw": str(url or "")[:220]}

    def _find_interesting_values(self, value: Any, *, limit: int = 80) -> list[dict[str, Any]]:
        found: list[dict[str, Any]] = []
        seen: set[int] = set()
        pattern = re.compile(r"cookie|cursor|buff|sync|msg|private|session|finder|uin|device|aid|token|ticket|auth|openid|username", re.I)

        def walk(obj: Any, path: str = "", depth: int = 0) -> None:
            if len(found) >= limit or depth > 8:
                return
            if isinstance(obj, str):
                return
            if obj is None:
                return
            if isinstance(obj, (dict, list)):
                obj_id = id(obj)
                if obj_id in seen:
                    return
                seen.add(obj_id)
            if isinstance(obj, dict):
                for key, child in obj.items():
                    if len(found) >= limit:
                        return
                    key_s = str(key)
                    child_path = f"{path}.{key_s}" if path else key_s
                    if pattern.search(key_s):
                        if isinstance(child, (str, int, float, bool)) or child is None:
                            found.append({
                                "path": child_path,
                                "type": type(child).__name__,
                                "value": self._snapshot_value(child, max_len=220),
                            })
                        elif isinstance(child, list):
                            found.append({"path": child_path, "type": "list", "length": len(child)})
                        elif isinstance(child, dict):
                            found.append({"path": child_path, "type": "dict", "keys": list(child.keys())[:20]})
                    walk(child, child_path, depth + 1)
            elif isinstance(obj, list):
                for idx, child in enumerate(obj[:30]):
                    walk(child, f"{path}[{idx}]", depth + 1)

        walk(value)
        return found

    def _summarize_request_body(self, request_body: Any) -> dict[str, Any]:
        if not isinstance(request_body, dict):
            return {"type": type(request_body).__name__, "value": self._snapshot_value(request_body, max_len=220)}
        out: dict[str, Any] = {}
        for key, value in request_body.items():
            if isinstance(value, (str, int, float, bool)) or value is None:
                out[str(key)] = self._snapshot_value(value, max_len=160)
            elif isinstance(value, list):
                out[str(key)] = {"type": "list", "length": len(value)}
            elif isinstance(value, dict):
                out[str(key)] = {"type": "dict", "keys": list(value.keys())[:20]}
        return out

    def _emit_captured_request(self, record: dict[str, Any], response_json: Any, request_body: Any) -> None:
        if not self.request_logger:
            return
        url = str(record.get("url") or "")
        source = str(record.get("source") or "")
        if "private-msg/get-new-msg" in url and source.startswith(("page_cursor_poll", "page_fetch_poll", "page_bootstrap_poll")):
            data = response_json.get("data") if isinstance(response_json, dict) and isinstance(response_json.get("data"), dict) else {}
            messages = data.get("msg") if isinstance(data.get("msg"), list) else []
            err_code = response_json.get("errCode") if isinstance(response_json, dict) else None
            # 空结果的主动心跳轮询对用户排障价值很低，会把接口窗口刷满。
            # 仍保留有消息、异常、发送、会话补全等请求记录。
            if int(err_code or 0) == 0 and not messages:
                return
        endpoint = "wechat_video_page/" + (url.split("/mmfinderassistant-bin/", 1)[1].split("?", 1)[0] if "/mmfinderassistant-bin/" in url else url[-120:])
        try:
            request_pretty = json.dumps(request_body if request_body not in ("", None) else {}, ensure_ascii=False, indent=2)
        except Exception:
            request_pretty = str(request_body or "{}")
        try:
            response_pretty = json.dumps(response_json if response_json not in ("", None) else {}, ensure_ascii=False, indent=2)
        except Exception:
            response_pretty = str(record.get("responseText", "") or "")
        self.request_logger({
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "method": str(record.get("method") or "POST").upper(),
            "url": url,
            "endpoint": endpoint,
            "params": {},
            "request_headers": self._mask_capture_headers(record.get("requestHeaders")),
            "request_body": request_body if isinstance(request_body, dict) else {},
            "request_body_pretty": request_pretty,
            "status_code": int(record.get("status") or 0),
            "duration_ms": int(record.get("durationMs") or 0),
            "response_body": response_json if isinstance(response_json, (dict, list)) else record.get("responseText", ""),
            "response_body_pretty": response_pretty,
            "ok": int(record.get("status") or 0) < 400,
            "robot_id": self.account.id,
            "robot_name": self.account.name,
            "platform": "WECHAT_VIDEO",
            "source": "wechat_video_page_response",
        })

    def _sanitize_template_headers(self, headers: Any) -> dict[str, str]:
        if not isinstance(headers, dict):
            return {}
        out: dict[str, str] = {}
        for key, value in headers.items():
            low = str(key).lower()
            if low in {"cookie", "host", "origin", "referer", "content-length", "x-ucp-bootstrap-poll", "x-ucp-bot-poll"}:
                continue
            if low.startswith(":"):
                continue
            out[str(key)] = str(value)
        out.setdefault("content-type", "application/json")
        out.setdefault("accept", "*/*")
        return out

    def _update_page_poll_template(self, record: dict[str, Any], request_body: Any, next_cookie: str = "") -> None:
        url = str(record.get("url") or "")
        if not url or "private-msg/get-new-msg" not in url:
            return
        body = dict(request_body) if isinstance(request_body, dict) else {}
        previous_body = self._page_poll_template.get("body") if isinstance(self._page_poll_template, dict) else {}
        previous_cursor = previous_body.get("cookie") if isinstance(previous_body, dict) else ""
        request_cursor = body.get("cookie")
        usable_cursor = ""
        if self._is_valid_message_cursor(next_cookie):
            usable_cursor = next_cookie
        elif self._is_valid_message_cursor(request_cursor):
            usable_cursor = str(request_cursor)
        elif self._is_valid_message_cursor(previous_cursor):
            usable_cursor = str(previous_cursor)

        if usable_cursor:
            body["cookie"] = usable_cursor
            self._persist_valid_dm_cursor(usable_cursor, str(record.get("tab") or ""))
        elif "cookie" in body and not self._is_valid_message_cursor(body.get("cookie")):
            body.pop("cookie", None)

        template = {
            "url": url,
            "method": str(record.get("method") or "POST").upper(),
            "headers": self._sanitize_template_headers(record.get("requestHeaders")),
            "body": body,
            "tab": str(record.get("tab") or ""),
            "capturedAt": int(time.monotonic() * 1000),
        }
        now = int(time.monotonic() * 1000)
        if usable_cursor:
            self._page_poll_template = template
            self._page_poll_candidate_template = None
        else:
            # Keep the request shape for diagnostics only. An empty/default cursor
            # cannot drive active polling and must not end bootstrap.
            self._page_poll_candidate_template = template
        if now - self._last_template_capture_log_ms > 4000:
            self._last_template_capture_log_ms = now
            label = "视频号真实 get-new-msg 模板已捕获" if usable_cursor else "视频号 get-new-msg 模板候选已捕获（等待有效游标）"
            self._log(
                "INFO",
                label + ": "
                + f"requestCursor={self._cursor_digest(request_cursor)} "
                + f"nextCursor={self._cursor_digest(next_cookie)} "
                + f"usableCursor={self._cursor_digest(usable_cursor)} "
                + f"source={record.get('source')} status={record.get('status')} url={str(url)[:140]}"
            )

    def _trigger_page_dm_tab_refresh(self, *, force: bool = False, target: str | None = None) -> str | None:
        """Trigger the official WeChat Video DM sub-tab to produce a real get-new-msg cursor.

        This deliberately runs during DM bootstrap even when the windowed runtime policy
        would otherwise be sleeping. Window policy controls *new business scans*; it must
        not block login/cursor/template bootstrap or the first page-owned get-new-msg.
        """
        if not self._running or self.module != "dm" or self.page is None:
            return None
        if not self._interface_loop_active():
            return None
        if self._dm_hard_sleep_blocks_interface_actions():
            return None
        if not force and not self._dm_cursor_bootstrap_in_progress() and not self._runtime_policy_allows_immediate_action():
            return None
        now = int(time.monotonic() * 1000)
        if not force and now - self._last_tab_trigger_ms < 6500:
            return None
        self._last_tab_trigger_ms = now
        if target not in {"私信", "打招呼消息"}:
            target = self._tab_trigger_next
        self._tab_trigger_next = "打招呼消息" if target == "私信" else "私信"
        self._tab_trigger_round += 1
        script = r"""
((target) => {
  const norm = (s) => String(s || '').replace(/\s+/g, '');
  const isTargetText = (txt) => {
    const t = norm(txt);
    if (t === target) return true;
    if (!t.startsWith(target)) return false;
    const suffix = t.slice(target.length);
    // Allow only a tiny unread-count badge after the exact tab label. Never accept
    // outer navigation text such as “互动管理评论弹幕私信” or “私信打招呼消息”.
    return suffix.length <= 8 && /^[0-9+()（）未读]*$/.test(suffix);
  };
  const visible = (el) => {
    if (!el) return false;
    try {
      const r = el.getBoundingClientRect();
      const st = el.ownerDocument.defaultView.getComputedStyle(el);
      return r.width > 1 && r.height > 1 && st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity || 1) > 0.01;
    } catch (e) { return false; }
  };
  const textOf = (el) => norm(el ? (el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '') : '');
  const clickLikeUser = (el) => {
    if (!el) return false;
    try { el.scrollIntoView({block:'center', inline:'center'}); } catch (e) {}
    const w = el.ownerDocument.defaultView || window;
    try { el.focus && el.focus(); } catch (e) {}
    for (const type of ['pointerover','mouseover','pointerdown','mousedown','pointerup','mouseup','click']) {
      try {
        if (type.startsWith('pointer')) {
          el.dispatchEvent(new w.PointerEvent(type, {bubbles:true, cancelable:true, view:w, pointerType:'mouse', isPrimary:true}));
        } else {
          el.dispatchEvent(new w.MouseEvent(type, {bubbles:true, cancelable:true, view:w}));
        }
      } catch (e) {
        try { el.dispatchEvent(new w.MouseEvent(type.replace('pointer','mouse'), {bubbles:true, cancelable:true, view:w})); } catch (_) {}
      }
    }
    try { el.click(); } catch (e) {}
    return true;
  };
  const docs = [];
  const walkWin = (w, depth) => {
    if (!w || depth > 5) return;
    try {
      if (w.document) docs.push({doc:w.document, url:String(w.location.href || ''), title:w.document.title || '', depth});
      const frames = w.frames || [];
      for (let i = 0; i < frames.length; i++) {
        try { walkWin(frames[i], depth + 1); } catch (e) {}
      }
    } catch (e) {}
  };
  walkWin(window, 0);
  const attempts = [];
  const bestClickable = (el) => {
    if (!el) return null;
    let cur = el;
    for (let i = 0; cur && i < 6; i++, cur = cur.parentElement) {
      const tag = String(cur.tagName || '').toLowerCase();
      const role = String(cur.getAttribute && cur.getAttribute('role') || '').toLowerCase();
      const cls = String(cur.className || '');
      if (['a','button','li'].includes(tag) || role === 'tab' || /tab|nav|menu|item/i.test(cls)) return cur;
    }
    return el;
  };
  const candidateSelector = [
    '[role="tab"]','[aria-selected]','a','button','li','span','div',
    '.weui-desktop-tab__nav','.weui-desktop-tab__navs__inner *',
    '[class*="tab"]','[class*="Tab"]','[class*="nav"]','[class*="Nav"]'
  ].join(',');
  for (const ctx of docs) {
    const doc = ctx.doc;
    const bodyText = textOf(doc.body || doc.documentElement || '');
    const verifiedFrame = ctx.url.includes('/micro/interaction/private_msg') || ctx.url.includes('/interaction/private_msg');
    attempts.push({mode:'doc_scan', url:ctx.url, depth:ctx.depth, verifiedFrame, bodyHasTarget:bodyText.includes(target), bodyText:bodyText.slice(0,80)});
    if (!verifiedFrame) continue;

    const groups = Array.from(doc.querySelectorAll('ul.weui-desktop-tab__navs__inner, [role="tablist"], ul, nav, [class*="tab"], [class*="Tab"]'));
    for (const group of groups) {
      const txt = textOf(group);
      if (!txt || !(txt.includes('私信') || txt.includes('打招呼消息'))) continue;
      attempts.push({mode:'group_scan', url:ctx.url, depth:ctx.depth, visible:visible(group), text:txt.slice(0,80)});
      const children = Array.from(group.querySelectorAll(candidateSelector));
      let targetEl = children.find(el => isTargetText(textOf(el))) || null;
      if (!targetEl && isTargetText(txt)) targetEl = group;
      if (targetEl) {
        const clickable = bestClickable(targetEl);
        clickLikeUser(clickable);
        return JSON.stringify({ok:true, verifiedFrame:true, mode:'group_click', target, text:textOf(targetEl).slice(0,80), frameUrl:ctx.url, depth:ctx.depth, visible:visible(targetEl), clickableText:textOf(clickable).slice(0,80), url:location.href});
      }
    }

    const nodes = Array.from(doc.querySelectorAll(candidateSelector));
    let hit = null;
    for (const el of nodes) {
      const t = textOf(el);
      if (!t || !t.includes(target)) continue;
      const v = visible(el);
      attempts.push({mode:'node_hit', url:ctx.url, depth:ctx.depth, visible:v, tag:String(el.tagName || '').toLowerCase(), text:t.slice(0,80)});
      if (isTargetText(t) && (v || ctx.url.includes('/private_msg') || ctx.url.includes('/interaction/private_msg'))) {
        hit = el;
        break;
      }
      // Combined outer/group text is deliberately rejected.
    }
    if (hit) {
      const clickable = bestClickable(hit);
      clickLikeUser(clickable);
      return JSON.stringify({ok:true, verifiedFrame:true, mode:'node_click', target, text:textOf(hit).slice(0,80), frameUrl:ctx.url, depth:ctx.depth, visible:visible(hit), clickableText:textOf(clickable).slice(0,80), url:location.href});
    }
  }
  return JSON.stringify({ok:false, reason:'tab_not_found_in_frames', target, url:location.href, title:document.title, frames:docs.map(x => ({url:x.url, title:x.title, depth:x.depth})).slice(0,10), attempts:attempts.slice(0,16)});
})(%TARGET%)
"""
        script = script.replace("%TARGET%", json.dumps(target, ensure_ascii=False))
        self.page.runJavaScript(script, lambda result: self._handle_tab_refresh_result(str(target), result))
        return str(target)

    def _handle_tab_refresh_result(self, target: str, result: Any) -> None:
        try:
            data = json.loads(result) if isinstance(result, str) and result else {}
        except Exception:
            data = {"raw": str(result)}
        ok = bool(data.get("ok") and data.get("verifiedFrame"))
        if data.get("ok") and not data.get("verifiedFrame"):
            data["ok"] = False
            data["reason"] = "unverified_outer_navigation_match"
        if ok:
            self._dm_tab_bootstrap_retry_count = 0
            self._dm_tab_bootstrap_retry_until_ms = 0
        level = "INFO" if ok else "WARN"
        self._log(level, f"视频号私信触发页面 Tab 以获取真实游标: {json.dumps({'target': target, **data}, ensure_ascii=False)}")
        if not ok and self._dm_cursor_bootstrap_in_progress():
            url = str(data.get("url") or "")
            reason = str(data.get("reason") or "")
            # If the page iframe has not rendered yet, retry on short cadence. This
            # restores the previous stable behavior where tab switching kept trying
            # until the official page produced private-msg/get-new-msg.
            if "login.html" not in url:
                delay = 1800 if reason == "tab_not_found_in_frames" else 3000
                self._schedule_dm_tab_bootstrap_retry(delay_ms=delay, reason=reason or "tab_refresh_failed")

    def _maybe_recover_dm_business_session(self) -> None:
        """Best-effort recovery for outer-login-valid / inner-DM-unready profiles.

        This never clears cookies, local storage, or the persistent WebEngine profile.
        It only reloads the existing private-message business iframe after a sustained
        period without a real cursor, then resumes exact-tab bootstrap.
        """
        if not self._running or self.module != "dm" or self.page is None:
            return
        if self._has_any_valid_dm_cursor() or not self._browser_runtime_started:
            return
        now = int(time.monotonic() * 1000)
        started = int(self._dm_bootstrap_started_ms or 0)
        if not started:
            self._dm_bootstrap_started_ms = now
            return
        if now - started < 35000 or now - int(self._dm_last_business_recovery_ms or 0) < 30000:
            return
        if self._dm_business_recovery_count >= 3:
            if self._dm_business_recovery_count == 3:
                self._dm_business_recovery_count += 1
                self._log("WARN", "视频号私信业务会话自动恢复多次仍未取得有效游标，请在页面确认当前账号或重新登录。")
            return
        self._dm_last_business_recovery_ms = now
        self._dm_business_recovery_count += 1
        script = r"""
(() => {
  const walk = (w, depth) => {
    if (!w || depth > 5) return null;
    try {
      const href = String(w.location && w.location.href || '');
      if (href.includes('/micro/interaction/private_msg')) return w;
      const frames = w.frames || [];
      for (let i = 0; i < frames.length; i++) {
        const hit = walk(frames[i], depth + 1);
        if (hit) return hit;
      }
    } catch (e) {}
    return null;
  };
  const biz = walk(window, 0);
  if (!biz) return JSON.stringify({ok:false, reason:'business_frame_not_found', url:location.href});
  try {
    const before = String(biz.location.href || '');
    biz.location.reload();
    return JSON.stringify({ok:true, action:'reload_private_message_business_frame', frameUrl:before});
  } catch (e) {
    return JSON.stringify({ok:false, reason:'business_frame_reload_failed', error:String(e)});
  }
})()
"""
        self.page.runJavaScript(script, self._handle_dm_business_recovery_result)

    def _handle_dm_business_recovery_result(self, result: Any) -> None:
        try:
            data = json.loads(result) if isinstance(result, str) and result else {}
        except Exception:
            data = {"raw": str(result)}
        level = "INFO" if data.get("ok") else "WARN"
        self._log(level, "视频号私信业务会话自动恢复: " + json.dumps(data, ensure_ascii=False))
        if self._running and self.module == "dm":
            QTimer.singleShot(2500, lambda: self._trigger_page_dm_tab_refresh(force=True, target="私信"))
            QTimer.singleShot(5000, lambda: self._trigger_page_dm_tab_refresh(force=True, target="打招呼消息"))

    def _maybe_trigger_cursor_active_poll(self, *, force: bool = False) -> bool:
        """Poll get-new-msg with a captured valid cursor even before a natural page template exists.

        This is the missing bridge between UCP and the old 泡泡自动化 behavior: once a
        real CgcI... cursor has appeared, the worker must actively poll both 私信 and
        打招呼消息. Waiting for a non-bot page template after that point leaves the bot
        idle even though the interface is already usable.
        """
        if not self._running or self.module != "dm" or self.page is None or self._cursor_poll_pending:
            return False
        if not self._interface_loop_active():
            return False
        if self._dm_hard_sleep_blocks_interface_actions():
            return False
        # A valid-cursor get-new-msg heartbeat is the real-time listener itself.
        # Ordinary window/cooldown policy must not stop it; only hard_sleep may do so.
        runtime = self._active_runtime
        if runtime is None or not runtime.aid:
            return False
        if not self._has_any_valid_dm_cursor():
            return False
        now = int(time.monotonic() * 1000)
        if not force and now - self._last_cursor_poll_ms < self._dm_cursor_poll_interval_ms:
            return False

        tabs = ["私信", "打招呼消息"]
        tab = tabs[self._cursor_poll_index % len(tabs)]
        self._cursor_poll_index += 1
        cursor = self._dm_cursor_for_tab(tab)
        if not self._is_valid_message_cursor(cursor):
            # Try the other tab before giving up; a single captured cursor is also
            # mirrored by _persist_valid_dm_cursor, but this fallback keeps old state safe.
            other = "打招呼消息" if tab == "私信" else "私信"
            alt = self._dm_cursor_for_tab(other)
            if not self._is_valid_message_cursor(alt):
                return False
            tab = other
            cursor = alt

        self._cursor_poll_pending = True
        self._last_cursor_poll_ms = now
        body = {
            "cookie": cursor,
            "timestamp": str(int(time.time() * 1000)),
            "_log_finder_uin": "",
            "_log_finder_id": runtime.finder_username,
            "rawKeyBuff": runtime.raw_key_buff,
            "pluginSessionId": runtime.plugin_session_id,
            "scene": 7,
            "reqScene": 7,
        }
        page_url = runtime.page_url or "https://channels.weixin.qq.com/micro/interaction/private_msg"
        url = runtime.build_url("private-msg/get-new-msg", page_url)
        headers = {
            "content-type": "application/json",
            "accept": "*/*",
            "X-WECHAT-UIN": runtime.x_wechat_uin or runtime.wxuin,
            "finger-print-device-id": runtime.device_id,
            "X-UCP-Bot-Poll": "1",
        }
        self._track_page_bot_poll(url, "POST", body)
        if now - self._last_cursor_active_log_ms > 15000:
            self._last_cursor_active_log_ms = now
            self._log("INFO", f"视频号私信进入有效游标主动轮询：tab={tab} cursor={self._cursor_digest(cursor)} template={'yes' if self._page_poll_template else 'no'}")

        script = f"""
(() => {{
  try {{
    const url = {json.dumps(url, ensure_ascii=False)};
    const headers = {json.dumps(headers, ensure_ascii=False)};
    const body = {json.dumps(body, ensure_ascii=False)};
    const tab = {json.dumps(tab, ensure_ascii=False)};
    const startedAt = Date.now();
    const sharedQueue = () => {{
      try {{
        if (window.top && window.top.location && window.top.location.origin === location.origin) {{
          window.top.__ucpWechatVideoCaptureQueue = window.top.__ucpWechatVideoCaptureQueue || [];
          return window.top.__ucpWechatVideoCaptureQueue;
        }}
      }} catch (e) {{}}
      window.__ucpWechatVideoCaptureQueue = window.__ucpWechatVideoCaptureQueue || [];
      return window.__ucpWechatVideoCaptureQueue;
    }};
    const push = (record) => {{
      try {{
        const q = sharedQueue();
        q.push(record);
        if (q.length > 300) q.splice(0, q.length - 300);
      }} catch (e) {{}}
    }};
    const findBizWindow = () => {{
      const walk = (w, depth) => {{
        if (!w || depth > 5) return null;
        try {{
          const href = String(w.location && w.location.href || '');
          if (href.includes('/micro/interaction/private_msg')) return w;
          const frames = w.frames || [];
          for (let i = 0; i < frames.length; i++) {{
            const hit = walk(frames[i], depth + 1);
            if (hit) return hit;
          }}
        }} catch (e) {{}}
        return null;
      }};
      return walk(window, 0) || window;
    }};
    const bizWindow = findBizWindow();
    const doFetch = bizWindow.__ucpWechatRawFetch || bizWindow.fetch.bind(bizWindow);
    doFetch(url, {{
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'include',
    }}).then(async (resp) => {{
      let text = '';
      try {{ text = await resp.text(); }} catch (e) {{ text = JSON.stringify({{error:String(e)}}); }}
      push({{
        source: 'page_cursor_poll_direct',
        tab,
        method: 'POST',
        url,
        status: resp.status || 0,
        durationMs: Date.now() - startedAt,
        requestHeaders: headers,
        requestBody: JSON.stringify(body),
        responseText: text || '',
      }});
    }}).catch((err) => {{
      push({{
        source: 'page_cursor_poll_error',
        tab,
        method: 'POST',
        url,
        status: 0,
        durationMs: Date.now() - startedAt,
        requestHeaders: headers,
        requestBody: JSON.stringify(body),
        responseText: JSON.stringify({{error: String(err)}}),
      }});
    }});
    return 'scheduled';
  }} catch (err) {{
    return 'error:' + String(err);
  }}
}})()
"""
        self.page.runJavaScript(script, self._handle_cursor_active_poll_scheduled)
        return True

    def _handle_cursor_active_poll_scheduled(self, result: Any) -> None:
        self._cursor_poll_pending = False
        if result not in (None, "scheduled"):
            self._log("WARN", f"视频号页面有效游标轮询调度异常：{result}")
            return
        # The fetch itself completes asynchronously inside the page. Arrange a near-term
        # queue drain and the next poll tick so active cursor polling continues even
        # when the worker is sleeping or the page does not naturally fire requests.
        if self._running and self.module == "dm":
            QTimer.singleShot(900, self._drain_network_capture_queue)
            QTimer.singleShot(self._dm_cursor_poll_interval_ms + 500, lambda: self._maybe_trigger_cursor_active_poll())

    def _maybe_trigger_page_template_poll(self) -> None:
        if not self._running or self.module != "dm" or self.page is None:
            return
        if not self._interface_loop_active():
            return
        if self._dm_hard_sleep_blocks_interface_actions():
            return
        # Template/cursor polling keeps the interface listener alive during ordinary
        # schedule cooldown. hard_sleep was already checked above.
        tpl = self._page_poll_template
        now = int(time.monotonic() * 1000)
        if not isinstance(tpl, dict):
            target = self._tab_trigger_next if self._tab_trigger_next in {"私信", "打招呼消息"} else "私信"
            has_cursor = self._has_any_valid_dm_cursor()
            # 有效游标已经拿到后，主要靠低频 page-context 轮询推进；Tab 刷新只作为保活/模板发现，
            # 不再每个 worker tick 都点击页面，避免频繁触发页面自身接口。
            if has_cursor:
                self._maybe_trigger_cursor_active_poll()
                if now - self._last_tab_trigger_ms > self._dm_tab_refresh_with_cursor_interval_ms:
                    self._trigger_page_dm_tab_refresh(target=target)
            else:
                self._trigger_page_dm_tab_refresh(target=target)
                self._maybe_trigger_page_bootstrap_poll(target=target)
                self._maybe_recover_dm_business_session()
            if now - self._last_template_wait_log_ms > 20000:
                self._last_template_wait_log_ms = now
                if has_cursor:
                    self._log("INFO", "视频号私信已拿到有效游标：按低频主动轮询获取新消息，并偶尔刷新页面 Tab 保活。")
                else:
                    self._log("INFO", "等待页面真实 get-new-msg 模板：已按泡泡方式切换私信/打招呼消息 Tab；无有效游标时不再用空 cookie 主动请求。")
            return
        if self._page_poll_pending or now - self._last_page_poll_ms < self._dm_page_template_poll_interval_ms:
            return
        self._page_poll_pending = True
        self._last_page_poll_ms = now
        body = dict(tpl.get("body") or {})
        tab = str(tpl.get("tab") or self._tab_trigger_next or "私信")
        if tab not in {"私信", "打招呼消息"}:
            tab = "私信"
        cursor = self._dm_cursor_for_tab(tab)
        if not self._is_valid_message_cursor(cursor):
            self._page_poll_pending = False
            self._trigger_page_dm_tab_refresh(target=tab)
            if now - self._last_template_wait_log_ms > 10000:
                self._last_template_wait_log_ms = now
                self._log("INFO", "视频号私信等待有效页面游标：已捕获模板但未拿到 CgcI... 类游标，跳过空 cookie 主动轮询。")
            return
        body["cookie"] = cursor
        body["timestamp"] = str(int(time.time() * 1000))
        url = str(tpl.get("url") or "")
        method = str(tpl.get("method") or "POST").upper()
        headers = dict(tpl.get("headers") or {})
        self._track_page_bot_poll(url, method, body)
        script = f"""
(() => {{
  try {{
    const url = {json.dumps(url, ensure_ascii=False)};
    const method = {json.dumps(method, ensure_ascii=False)};
    const headers = {json.dumps(headers, ensure_ascii=False)};
    const body = {json.dumps(body, ensure_ascii=False)};
    const tab = {json.dumps(tab, ensure_ascii=False)};
    const startedAt = Date.now();
    const push = (record) => {{
      try {{
        const q = window.__ucpWechatVideoCaptureQueue = window.__ucpWechatVideoCaptureQueue || [];
        q.push(record);
        if (q.length > 300) q.splice(0, q.length - 300);
      }} catch (e) {{}}
    }};
    const findBizWindow = () => {{
      const walk = (w, depth) => {{
        if (!w || depth > 4) return null;
        try {{
          const href = String(w.location && w.location.href || '');
          if (href.includes('/micro/interaction/private_msg')) return w;
          const frames = w.frames || [];
          for (let i = 0; i < frames.length; i++) {{
            const hit = walk(frames[i], depth + 1);
            if (hit) return hit;
          }}
        }} catch (e) {{}}
        return null;
      }};
      return walk(window, 0) || window;
    }};
    const bizWindow = findBizWindow();
    const doFetch = bizWindow.__ucpWechatRawFetch || bizWindow.fetch.bind(bizWindow);
    doFetch(url, {{
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(body),
      credentials: 'include',
    }}).then(async (resp) => {{
      let text = '';
      try {{ text = await resp.text(); }} catch (e) {{ text = JSON.stringify({{error:String(e)}}); }}
      push({{
        source: 'page_fetch_poll_direct',
        tab,
        method,
        url,
        status: resp.status || 0,
        durationMs: Date.now() - startedAt,
        requestHeaders: headers,
        requestBody: JSON.stringify(body),
        responseText: text || '',
      }});
    }}).catch((err) => {{
      push({{
        source: 'page_fetch_poll_error',
        tab,
        method,
        url,
        status: 0,
        durationMs: Date.now() - startedAt,
        requestHeaders: headers,
        requestBody: JSON.stringify(body),
        responseText: JSON.stringify({{error: String(err)}}),
      }});
    }});
    return 'scheduled';
  }} catch (err) {{
    return 'error:' + String(err);
  }}
}})()
"""
        self.page.runJavaScript(script, self._handle_page_template_poll_scheduled)

    def _maybe_trigger_page_bootstrap_poll(self, target: str | None = None) -> None:
        """Run a Paopao-style get-new-msg poll in the browser page context.

        泡泡自动化的稳定链路不是用外部 urllib 猜游标，而是在浏览器上下文
        携带当前登录态调用 private-msg/get-new-msg；响应里的 data.cookie 才是
        下一轮消息游标。实践日志表明空 cookie 会得到 CgAKAA== 或 300334，
        不能作为有效首游标；首游标必须来自页面真实请求或浏览器存储。
        """
        if not self._running or self.module != "dm" or self.page is None or self._bootstrap_poll_pending:
            return
        if not self._interface_loop_active():
            return
        if self._dm_hard_sleep_blocks_interface_actions():
            return
        if not self._runtime_policy_allows_immediate_action():
            return
        runtime = self._active_runtime
        if runtime is None or not runtime.aid:
            return
        now = int(time.monotonic() * 1000)
        if now - self._last_bootstrap_poll_ms < self._dm_page_template_poll_interval_ms:
            return
        tab = target if target in {"私信", "打招呼消息"} else self._tab_trigger_next
        if tab not in {"私信", "打招呼消息"}:
            tab = "私信"
        self._last_bootstrap_poll_ms = now
        self._bootstrap_poll_pending = True
        cursor = self._dm_cursor_for_tab(tab)
        if not self._is_valid_message_cursor(cursor):
            self._bootstrap_poll_pending = False
            if now - self._last_template_wait_log_ms > 10000:
                self._last_template_wait_log_ms = now
                self._log("INFO", "视频号私信等待页面真实游标：不再用空 cookie 主动调用 get-new-msg，避免得到 CgAKAA==。")
            return
        body = {
            "cookie": cursor,
            "timestamp": str(int(time.time() * 1000)),
            "_log_finder_uin": "",
            "_log_finder_id": runtime.finder_username,
            "rawKeyBuff": runtime.raw_key_buff,
            "pluginSessionId": runtime.plugin_session_id,
            "scene": 7,
            "reqScene": 7,
        }
        url = runtime.build_url("private-msg/get-new-msg", runtime.page_url)
        headers = {
            "content-type": "application/json",
            "accept": "*/*",
            "X-WECHAT-UIN": runtime.x_wechat_uin or runtime.wxuin,
            "finger-print-device-id": runtime.device_id,
        }
        self._track_page_bot_poll(url, "POST", body)
        script = f"""
(() => {{
  try {{
    const url = {json.dumps(url, ensure_ascii=False)};
    const headers = {json.dumps(headers, ensure_ascii=False)};
    const body = {json.dumps(body, ensure_ascii=False)};
    const tab = {json.dumps(tab, ensure_ascii=False)};
    const startedAt = Date.now();
    const push = (record) => {{
      try {{
        const q = window.__ucpWechatVideoCaptureQueue = window.__ucpWechatVideoCaptureQueue || [];
        q.push(record);
        if (q.length > 300) q.splice(0, q.length - 300);
      }} catch (e) {{}}
    }};
    const findBizWindow = () => {{
      const walk = (w, depth) => {{
        if (!w || depth > 4) return null;
        try {{
          const href = String(w.location && w.location.href || '');
          if (href.includes('/micro/interaction/private_msg')) return w;
          const frames = w.frames || [];
          for (let i = 0; i < frames.length; i++) {{
            const hit = walk(frames[i], depth + 1);
            if (hit) return hit;
          }}
        }} catch (e) {{}}
        return null;
      }};
      return walk(window, 0) || window;
    }};
    const bizWindow = findBizWindow();
    const doFetch = bizWindow.__ucpWechatRawFetch || bizWindow.fetch.bind(bizWindow);
    doFetch(url, {{
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'include',
    }}).then(async (resp) => {{
      let text = '';
      try {{ text = await resp.text(); }} catch (e) {{ text = JSON.stringify({{error:String(e)}}); }}
      push({{
        source: 'page_bootstrap_poll_direct',
        tab,
        method: 'POST',
        url,
        status: resp.status || 0,
        durationMs: Date.now() - startedAt,
        requestHeaders: headers,
        requestBody: JSON.stringify(body),
        responseText: text || '',
      }});
    }}).catch((err) => {{
      push({{
        source: 'page_bootstrap_poll_error',
        tab,
        method: 'POST',
        url,
        status: 0,
        durationMs: Date.now() - startedAt,
        requestHeaders: headers,
        requestBody: JSON.stringify(body),
        responseText: JSON.stringify({{error: String(err)}}),
      }});
    }});
    return 'scheduled';
  }} catch (err) {{
    return 'error:' + String(err);
  }}
}})()
"""
        self.page.runJavaScript(script, self._handle_page_bootstrap_poll_scheduled)

    def _handle_page_bootstrap_poll_scheduled(self, result: Any) -> None:
        self._bootstrap_poll_pending = False
        if result not in (None, "scheduled"):
            self._log("WARN", f"视频号页面 bootstrap 轮询调度异常：{result}")
            return
        if self._running and self.module == "dm":
            QTimer.singleShot(900, self._drain_network_capture_queue)

    def _handle_page_template_poll_scheduled(self, result: Any) -> None:
        self._page_poll_pending = False
        if result not in (None, "scheduled"):
            self._log("WARN", f"视频号页面模板轮询调度异常：{result}")
            return
        if self._running and self.module == "dm":
            QTimer.singleShot(900, self._drain_network_capture_queue)
            QTimer.singleShot(self._dm_page_template_poll_interval_ms + 500, self._maybe_trigger_page_template_poll)

    def _handle_network_capture_records(self, result: Any) -> None:
        if not self._running:
            return
        try:
            records = json.loads(result) if isinstance(result, str) and result else []
        except Exception as exc:
            self._log("WARN", f"解析视频号页面网络监听记录失败：{type(exc).__name__}: {str(exc)[:120]}")
            return
        if not isinstance(records, list):
            return
        for record in records:
            if not isinstance(record, dict):
                continue
            url = str(record.get("url") or "")
            response_json = self._safe_json_loads(record.get("responseText") or "")
            request_body = self._safe_json_loads(record.get("requestBody") or "")
            self._emit_captured_request(record, response_json, request_body)
            if "private-msg/get-new-msg" not in url:
                continue
            source = str(record.get("source") or "")
            tab = str(record.get("tab") or "")
            if tab not in {"私信", "打招呼消息"}:
                tab = "私信"
            is_bot_poll = self._is_tracked_page_bot_poll(record, request_body)
            data = response_json.get("data") if isinstance(response_json, dict) and isinstance(response_json.get("data"), dict) else {}
            messages = data.get("msg") if isinstance(data.get("msg"), list) else []
            request_cookie = request_body.get("cookie") if isinstance(request_body, dict) else ""
            response_cookie = data.get("cookie") if isinstance(data.get("cookie"), str) else ""
            err_code = response_json.get("errCode") if isinstance(response_json, dict) else None

            if not is_bot_poll and int(err_code or 0) == 0:
                # 只有页面自身产生的 get-new-msg 才能作为模板；UCP 主动轮询只用于推进 cookie，
                # 不能反过来覆盖官方模板，否则会把空 cursor 或自造 header 写进模板。
                if tab:
                    record["tab"] = tab
                self._update_page_poll_template(record, request_body, response_cookie)
            elif is_bot_poll and self._page_poll_template is None and self._is_valid_message_cursor(response_cookie):
                # 浏览器上下文主动拉取拿到了真实 data.cookie，但还未捕获页面自然模板；
                # 继续靠这个 cookie 轮询，直到页面自然请求出现再补模板。
                pass

            if self._is_valid_message_cursor(response_cookie):
                self._persist_valid_dm_cursor(response_cookie, tab)
            elif self._is_valid_message_cursor(request_cookie):
                self._persist_valid_dm_cursor(str(request_cookie), tab)

            # Once a valid cursor exists, do not wait for the worker's next 8s sleep to
            # discover it. Queue the active poller on the GUI thread; throttling inside
            # _maybe_trigger_cursor_active_poll prevents request bursts.
            if self._has_any_valid_dm_cursor() and self.module == "dm" and self._page_poll_template is None:
                QTimer.singleShot(0, lambda: self._maybe_trigger_cursor_active_poll())

            now = int(time.monotonic() * 1000)
            if messages or now - self._last_capture_log_ms > 6000:
                self._last_capture_log_ms = now
                self._log(
                    "INFO",
                    "视频号页面响应捕获："
                    + f"get-new-msg status={record.get('status')} errCode={err_code} msg={len(messages)} "
                    + f"tab={tab} cursor={self._cursor_digest(request_cookie)} next={self._cursor_digest(response_cookie)} "
                    + f"source={source} bot={1 if is_bot_poll else 0}"
                )
            if messages:
                appended = 0
                with self._page_message_lock:
                    for item in messages:
                        if isinstance(item, dict):
                            item["_captureSource"] = source or ("page_bot_poll" if is_bot_poll else "page_response")
                            item["_sourceTab"] = tab
                            item["_ucpCapturedMonotonicMs"] = now
                            self._page_private_messages.append(item)
                            appended += 1
                    if len(self._page_private_messages) > 200:
                        self._page_private_messages = self._page_private_messages[-200:]
                if appended:
                    # Wake the worker immediately instead of waiting for the next fixed
                    # 8-second loop. This mirrors 泡泡自动化: page.on("response")
                    # pushes messages into a queue and the bot loop consumes them right away.
                    self._dm_message_event.set()

    def _consume_page_private_messages(self) -> list[dict[str, Any]]:
        with self._page_message_lock:
            items = list(self._page_private_messages)
            self._page_private_messages.clear()
        return items

    def preview_widget(self) -> QWidget:
        return self._ensure_view()

    def open_preview(self) -> None:
        self._ensure_view()
        self.title_changed.emit(self.account.id, "微信视频号助手")

    def release_preview(self, destroy: bool = False) -> None:
        if destroy and self.page is not None:
            self.page.load(QUrl("about:blank"))

    def shutdown_webengine(self) -> None:
        """Gracefully detach WebEngine objects before controller/window destruction."""
        try:
            self.browser_poll_timer.stop()
            self.network_capture_timer.stop()
        except Exception:
            pass
        try:
            if self.page is not None:
                self.page.load(QUrl("about:blank"))
        except Exception:
            pass
        try:
            if self.view is not None:
                self.view.setPage(None)
        except Exception:
            pass
        try:
            if self.page is not None:
                self.page.deleteLater()
        except Exception:
            pass
        self.page = None
        try:
            self._release_shared_wechat_profile()
        except Exception:
            pass
        self.profile = None
        try:
            if self.view is not None:
                self.view.deleteLater()
        except Exception:
            pass
        self.view = None

    def logout_platform_account(self) -> None:
        self._log("INFO", "正在清理微信视频号本地浏览器登录状态。")
        try:
            self.stop()
        except Exception:
            pass
        try:
            if self.profile is not None:
                self.profile.cookieStore().deleteAllCookies()
                self.profile.clearHttpCache()
        except Exception:
            pass
        profile_dir = self._wechat_account_profile_dir()
        def _cleanup() -> None:
            import shutil
            try:
                if profile_dir.exists():
                    shutil.rmtree(profile_dir, ignore_errors=True)
                self._log("INFO", f"已清理微信视频号本地浏览器登录目录：{profile_dir}")
            except Exception as exc:
                self._log("WARN", f"清理微信视频号登录目录失败：{exc}")
        QTimer.singleShot(600, _cleanup)

    def is_running(self) -> bool:
        return self._running

    def current_state(self) -> str:
        return self.last_state or ("运行中" if self._running else "已停止")

    def start(self, module: str) -> None:
        if self._running:
            return
        self.module = module
        self.target_url = WECHAT_VIDEO_URLS["comment" if module == "comment" else "dm"]
        try:
            self.runtime_policy.set_module(module)
            self._apply_runtime_policy_to_runtime_config()
        except Exception as exc:
            self._log("WARN", f"视频号运行节奏配置初始化失败，继续使用本地默认策略：{type(exc).__name__}: {str(exc)[:120]}")
        self._stop_event.clear()
        self._running = True
        self._browser_runtime_started = False
        self._interface_generation += 1
        self._interface_paused_for_login = True
        self._login_confirm_candidate_since_ms = 0
        self._post_login_redirect_done = False
        self._using_external_runtime = False
        self._external_runtime_owner_id = ""
        self._external_runtime_finder_key = ""
        self._active_runtime = None
        self._page_poll_pending = False
        self._bootstrap_poll_pending = False
        self._cursor_poll_pending = False
        self._last_cursor_poll_ms = 0
        self._cursor_poll_index = 0
        self._dm_tab_bootstrap_retry_count = 0
        self._dm_tab_bootstrap_retry_until_ms = 0
        self._page_poll_template = None
        self._page_poll_candidate_template = None
        self._dm_poll_cookie_by_tab.clear()
        self._dm_retry_attempts.clear()
        self._dm_retry_exhausted_ids.clear()
        with self._dm_session_info_lock:
            self._dm_session_info_pending.clear()
        self._dm_bootstrap_started_ms = int(time.monotonic() * 1000)
        self._dm_last_business_recovery_ms = 0
        self._dm_business_recovery_count = 0
        with self._bot_poll_signature_lock:
            self._bot_poll_signatures.clear()
        with self._page_message_lock:
            self._page_private_messages.clear()
        self._dm_aggregate_windows.clear()
        self._dm_message_event.clear()
        self._last_wait_log_ms = 0
        self._last_param_wait_log_ms = 0
        self._set_state("启动中")

        # Do not borrow a placeholder-only runtime here.  Same-account DM/comment now
        # share one in-process QWebEngineProfile while keeping separate pages/views, so
        # both modules can be visible and interactive at the same time.
        self._ensure_view()
        self._log("INFO", f"启动微信视频号会话，模块={module}，目标地址={self.target_url}")
        if self.page is not None:
            self.page.load(QUrl(self.target_url))
        self.browser_poll_timer.start()
        self.network_capture_timer.start()

    def stop(self) -> None:
        if not self._running:
            return
        self._stop_event.set()
        self._dm_message_event.set()
        self._dm_aggregate_windows.clear()
        self._running = False
        self._interface_generation += 1
        self._interface_paused_for_login = True
        self.browser_poll_timer.stop()
        self.network_capture_timer.stop()
        self._page_poll_pending = False
        self._bootstrap_poll_pending = False
        self._cursor_poll_pending = False
        self._unregister_active_wechat_runtime()
        self._set_state("已停止")
        self._log("INFO", "微信视频号机器人已请求停止。")

    def _run_interface_loop(self, runtime: WeChatVideoRuntime, generation: int) -> None:
        try:
            if not self._interface_loop_active(generation):
                return
            client = WeChatVideoApiClient(
                runtime,
                log=lambda level, msg: self._log(level, msg),
                request_logger=self.request_logger,
                robot_id=self.account.id,
                robot_name=self.account.name,
            )
            self._log("INFO", f"微信视频号接口化处理启动：module={self.module} finder={runtime.finder_username or '-'}")
            if self.module == "comment":
                self._run_comment_loop(client, runtime, generation)
            else:
                self._run_dm_loop(client, runtime, generation)
        except Exception as exc:
            if self._running:
                self._log("ERROR", f"微信视频号接口化处理异常退出：{type(exc).__name__}: {str(exc)[:240]}")
                self._set_state("错误")
        finally:
            if self._stop_event.is_set():
                self._set_state("已停止")

    def _poll_browser_login_state(self) -> None:
        if not self._running or self.page is None:
            return
        script = r"""
(() => {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const compact = (s) => norm(s).replace(/\s+/g, '');
  let aid = '';
  try { aid = JSON.parse(localStorage.getItem('__ml::aid') || '""') || ''; } catch(e) { aid = localStorage.getItem('__ml::aid') || ''; }
  const finderUsername = localStorage.getItem('finder_username') || localStorage.getItem('_log_finder_id') || '';
  const deviceId = localStorage.getItem('_finger_print_device_id') || localStorage.getItem('fingerPrintDeviceId') || '';
  const lsWxuin = localStorage.getItem('wxuin') || localStorage.getItem('wx_uin') || localStorage.getItem('uin') || localStorage.getItem('xWechatUin') || '';
  const dmMessageCookie = localStorage.getItem('dm_message_cookie') || localStorage.getItem('ucp_dm_message_cookie') || localStorage.getItem('messageCookie') || '';
  const readStorage = (store, frameUrl = location.href) => {
    const out = [];
    try {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        let value = store.getItem(key);
        out.push({ key: String(key || ''), value: String(value || ''), length: String(value || '').length, frameUrl });
      }
    } catch (e) {}
    return out;
  };
  const cookieItems = [];
  try {
    String(document.cookie || '').split(';').forEach((part) => {
      const idx = part.indexOf('=');
      if (idx > 0) cookieItems.push({ key: part.slice(0, idx).trim(), value: part.slice(idx + 1).trim(), length: part.slice(idx + 1).trim().length });
    });
  } catch (e) {}
  const frameInfos = [];
  const walkFrames = (w, depth) => {
    if (!w || depth > 4) return;
    try {
      frameInfos.push({
        url: String(w.location && w.location.href || ''),
        localItems: readStorage(w.localStorage, String(w.location && w.location.href || '')),
        sessionItems: readStorage(w.sessionStorage, String(w.location && w.location.href || '')),
      });
      const frames = w.frames || [];
      for (let i = 0; i < frames.length; i++) {
        try { walkFrames(frames[i], depth + 1); } catch (e) {}
      }
    } catch (e) {}
  };
  walkFrames(window, 0);
  const localItems = [].concat(...frameInfos.map(x => x.localItems || []));
  const sessionItems = [].concat(...frameInfos.map(x => x.sessionItems || []));
  const isInteresting = (k) => /cookie|cursor|buff|sync|msg|private|session|finder|uin|device|aid|token/i.test(String(k || ''));
  const storageCandidates = localItems.concat(sessionItems).filter((x) => isInteresting(x.key));
  const isValidCursor = (v) => {
    const s = String(v || '').trim();
    return !!s && s !== 'CgAKAA==' && s.length > 10 && s.length <= 160 && /^Cg[A-Za-z0-9+/=]+$/.test(s);
  };
  const extractCursor = (v) => {
    const s = String(v || '');
    if (isValidCursor(s)) return s.trim();
    const m = s.match(/Cg[A-Za-z0-9+/=]{10,160}/g) || [];
    for (const one of m) { if (isValidCursor(one)) return one; }
    return '';
  };
  let dmMessageCookieCandidate = extractCursor(dmMessageCookie);
  if (!dmMessageCookieCandidate) {
    for (const item of storageCandidates) {
      const key = String(item.key || '');
      const value = String(item.value || '');
      if (!isInteresting(key) && !/Cg[A-Za-z0-9+/=]{10,160}/.test(value)) continue;
      const got = extractCursor(value);
      if (got) { dmMessageCookieCandidate = got; break; }
    }
  }
  const text = compact(document.body ? document.body.innerText : '');
  const url = location.href;
  const loginUiVisible =
    url.includes('login') ||
    url.includes('passport') ||
    text.includes('登录视频号助手') ||
    text.includes('扫码登录') ||
    text.includes('请使用微信扫描') ||
    text.includes('微信扫一扫') ||
    text.includes('二维码已失效');
  // 必须是稳定业务页且没有扫码/登录 UI，才允许启动接口化业务线程。
  // 过期 profile 可能短暂进入 /platform/private_msg 后立刻回 login.html，
  // 不能在这个瞬间用旧 storage/cookie 误判为已登录。
  const loggedIn =
    url.includes('channels.weixin.qq.com') &&
    url.includes('/platform') &&
    !url.includes('login') &&
    !url.includes('passport') &&
    !loginUiVisible;
  return JSON.stringify({
    url,
    title: document.title || '',
    loggedIn,
    loginUiVisible,
    aid,
    finderUsername,
    deviceId,
    lsWxuin,
    dmMessageCookie: dmMessageCookieCandidate || dmMessageCookie,
    cookie: document.cookie || '',
    cookieItems,
    localStorageItems: localItems,
    sessionStorageItems: sessionItems,
    storageCandidates,
    bodyText: text.slice(0, 260),
  });
})()
"""
        self.page.runJavaScript(script, self._handle_browser_login_state)

    def _snapshot_value(self, value: Any, *, max_len: int = 220, reveal_full_small: bool = True) -> str:
        text = str(value or "")
        if not text:
            return ""
        if reveal_full_small and len(text) <= max_len:
            return text
        if len(text) <= 16:
            return f"{text}({len(text)})"
        return f"{text[:10]}...{text[-8:]}({len(text)})"

    def _summarize_storage_items(self, items: Any, *, only_interesting: bool = False, limit: int = 120) -> list[dict[str, Any]]:
        if not isinstance(items, list):
            return []
        out: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            key = str(item.get("key") or "")
            value = str(item.get("value") or "")
            if only_interesting and not re.search(r"cookie|cursor|buff|sync|msg|private|session|finder|uin|device|aid|token", key, re.I):
                continue
            # Full browser cookies are never printed here; storage values are shortened but
            # enough to identify CgAKAA== vs CgcI... cursor families.
            out.append({
                "key": key,
                "length": int(item.get("length") or len(value)),
                "value": self._snapshot_value(value, max_len=360),
            })
            if len(out) >= limit:
                break
        return out

    def _summarize_cookie_items(self, items: Any, *, limit: int = 80) -> list[dict[str, Any]]:
        if not isinstance(items, list):
            return []
        out: list[dict[str, Any]] = []
        for item in items[:limit]:
            if not isinstance(item, dict):
                continue
            key = str(item.get("key") or "")
            value = str(item.get("value") or "")
            out.append({
                "key": key,
                "length": int(item.get("length") or len(value)),
                "value": self._snapshot_value(value, max_len=32, reveal_full_small=False),
            })
        return out

    def _log_login_runtime_snapshot(self, data: dict[str, Any], runtime: WeChatVideoRuntime, *, force: bool = False, reason: str = "") -> None:
        # 诊断期大量 storage/cookie 日志容易撑爆日志窗口；当前只保留游标相关日志。
        return

    def _log_login_probe_summary(self, data: dict[str, Any], runtime: WeChatVideoRuntime | None = None, *, force: bool = False) -> None:
        # 当前只保留 get-new-msg 游标捕获日志，不再打印登录 storage 快照。
        return

    def _log_storage_snapshot_chunks(self, data: dict[str, Any], *, force: bool = False, reason: str = "") -> None:
        return

    def _handle_browser_login_state(self, result: Any) -> None:
        if not self._running:
            return
        try:
            data = json.loads(result) if isinstance(result, str) else (result if isinstance(result, dict) else {})
        except Exception:
            data = {}
        url = str(data.get("url") or "")
        logged_in = bool(data.get("loggedIn"))
        now = int(time.monotonic() * 1000)
        runtime = self._runtime_from_browser_probe(data)
        if not logged_in:
            self._pause_interface_for_login(reason="browser_probe_not_logged_in", url=url)
            if now - self._last_wait_log_ms > 12000:
                self._last_wait_log_ms = now
                self._log("INFO", f"等待微信视频号登录/授权完成：url={url[:160]} title={str(data.get('title') or '')[:80]}")
            return

        if not self._browser_runtime_started:
            if self._login_confirm_candidate_since_ms <= 0:
                self._login_confirm_candidate_since_ms = now
                if now - self._last_login_confirm_pending_log_ms > 8000:
                    self._last_login_confirm_pending_log_ms = now
                    self._log("INFO", f"微信视频号检测到业务页，等待登录态稳定确认后再启动接口化处理：url={url[:160]}")
                return
            if now - self._login_confirm_candidate_since_ms < 2500:
                return

        missing = [name for name in ("aid", "device_id", "x_wechat_uin") if not getattr(runtime, name)]
        snapshot_reason = "login_detected_before_redirect" if (self.page is not None and self.target_url and self.target_url not in url and not self._post_login_redirect_done) else ("login_detected" if not missing else f"missing:{','.join(missing)}")

        if self.page is not None and self.target_url and self.target_url not in url and not self._post_login_redirect_done:
            self._post_login_redirect_done = True
            self._login_confirm_candidate_since_ms = 0
            self._log("INFO", f"微信视频号登录已识别，跳转目标模块：{self.target_url}")
            self.page.load(QUrl(self.target_url))
            QTimer.singleShot(2500, lambda: self._trigger_page_dm_tab_refresh(force=True))
            return

        if missing:
            if now - self._last_param_wait_log_ms > 8000:
                self._last_param_wait_log_ms = now
                self._log(
                    "WARN",
                    "微信视频号已进入 /platform，登录态已确认；但接口运行参数暂未完整，继续等待页面运行时数据："
                    + ", ".join(missing)
                    + f"；aid={bool(runtime.aid)} deviceId={bool(runtime.device_id)} xWechatUin={bool(runtime.x_wechat_uin)} cookieNames={list(self._cookies.keys())[:12]}"
                )
            return

        if self._browser_runtime_started:
            self._interface_paused_for_login = False
            self._merge_active_runtime(runtime)
            return
        self._browser_runtime_started = True
        self._interface_paused_for_login = False
        self._login_confirm_candidate_since_ms = 0
        self._active_runtime = runtime
        self._refresh_active_runtime_from_cookie_map()
        self._register_active_wechat_runtime(runtime)
        self._dm_poll_cookie_by_tab.clear()
        if self._is_valid_message_cursor(runtime.dm_message_cookie):
            self._dm_poll_cookie_by_tab["私信"] = runtime.dm_message_cookie
            self._dm_poll_cookie_by_tab["打招呼消息"] = runtime.dm_message_cookie
        self._set_state("运行中")
        self.auth_confirmed.emit(self.account.id, {"mode": "browser_interface", "finderUsername": runtime.finder_username, "accountUid": runtime.wxuin})
        self._sync_wx_auth_runtime(runtime)
        QTimer.singleShot(1500, lambda: self._trigger_page_dm_tab_refresh(force=True))
        self._interface_generation += 1
        generation = self._interface_generation
        self._interface_paused_for_login = False
        self._future = self._executor.submit(self._run_interface_loop, runtime, generation)

    def _runtime_from_browser_probe(self, data: dict[str, Any]) -> WeChatVideoRuntime:
        cookie_from_page = str(data.get("cookie") or "")
        cookie_map = dict(self._cookies)
        if cookie_from_page:
            for part in cookie_from_page.split(";"):
                if "=" in part:
                    k, v = part.split("=", 1)
                    cookie_map[k.strip()] = v.strip()
        cookie_header = "; ".join(f"{k}={v}" for k, v in cookie_map.items() if k and v)
        browser_wxuin = cookie_map.get("wxuin") or cookie_map.get("uin") or ""
        x_wechat_uin = str(data.get("lsWxuin") or browser_wxuin or "")
        page_url = "https://channels.weixin.qq.com/micro/interaction/comment" if self.module == "comment" else "https://channels.weixin.qq.com/micro/interaction/private_msg"
        dm_message_cookie = str(data.get("dmMessageCookie") or "")
        if not self._is_valid_message_cursor(dm_message_cookie):
            dm_message_cookie = ""
        return WeChatVideoRuntime(
            aid=str(data.get("aid") or ""),
            finder_username=str(data.get("finderUsername") or self.account.auth_uid or self.account.auth_name or ""),
            device_id=str(data.get("deviceId") or ""),
            wxuin=str(x_wechat_uin or browser_wxuin or ""),
            cookie=cookie_header,
            page_url=page_url,
            raw={"browserProbe": data, "cookieNames": list(cookie_map.keys())},
            x_wechat_uin=x_wechat_uin,
            browser_wxuin=browser_wxuin,
            dm_message_cookie=dm_message_cookie,
        )

    def _sync_wx_auth_runtime(self, runtime: WeChatVideoRuntime) -> None:
        if not self.core_service:
            return
        payload = {
            "aid": runtime.aid,
            "finderUsername": runtime.finder_username,
            "deviceId": runtime.device_id,
            "wxuin": runtime.browser_wxuin or runtime.wxuin,
            "xWechatUin": runtime.x_wechat_uin or runtime.wxuin,
            "cookie": runtime.cookie,
            "dmMessageCookie": runtime.dm_message_cookie,
            "pageUrl": runtime.page_url,
        }
        try:
            updated = self.core_service.sync_robot_auth_status(
                self.account.id,
                "AUTHORIZED",
                account_name=runtime.finder_username or self.account.auth_name,
                account_uid=runtime.wxuin,
                session_data=json.dumps(payload, ensure_ascii=False),
                source="wechat_video_browser",
            )
            if updated and updated.id:
                updated.runtime_status = self.account.runtime_status
                self.account = updated
        except Exception as exc:
            self._log("WARN", f"同步微信视频号授权运行参数失败：{type(exc).__name__}: {str(exc)[:160]}")

    def _runtime_policy_hard_sleep_remaining_sec(self) -> float:
        """Return hard-sleep remaining seconds only, independent of DM bootstrap/cooldown."""
        try:
            controller = getattr(self, "runtime_policy", None)
            if controller is None:
                return 0.0
            return max(0.0, float(controller.hard_sleep_seconds_until_wake() or 0.0))
        except Exception as exc:
            self._log("WARN", f"视频号夜间休眠检查异常，继续按普通节奏处理：{type(exc).__name__}: {str(exc)[:120]}")
            return 0.0

    def _prepare_dm_for_hard_sleep(self, *, remaining_sec: float) -> None:
        """Block WeChat Video DM bootstrap/poll timers during hard_sleep without touching other modules."""
        if getattr(self, "module", "") != "dm":
            return
        try:
            # These flags only describe scheduled page-context polls.  A hard-sleep period
            # must not leave them stuck true until the next callback, and every entry point
            # below re-checks hard_sleep before scheduling a new page request.
            self._page_poll_pending = False
            self._bootstrap_poll_pending = False
            self._cursor_poll_pending = False
            self._dm_message_event.clear()
            now_ms = int(time.monotonic() * 1000)
            if now_ms - getattr(self, "_last_dm_hard_sleep_log_ms", 0) > 300000:
                self._last_dm_hard_sleep_log_ms = now_ms
                self._log("INFO", f"视频号私信进入 hard_sleep 休眠：暂停 Tab 触发、页面轮询和私信处理，remainingSec={int(max(0.0, remaining_sec) + 0.999)}")
        except Exception as exc:
            self._log("WARN", f"视频号私信休眠态清理异常，继续休眠：{type(exc).__name__}: {str(exc)[:120]}")

    def _dm_hard_sleep_blocks_interface_actions(self) -> bool:
        if getattr(self, "module", "") != "dm":
            return False
        remaining = self._runtime_policy_hard_sleep_remaining_sec()
        if remaining <= 0:
            return False
        self._prepare_dm_for_hard_sleep(remaining_sec=remaining)
        return True

    def _apply_runtime_policy_to_runtime_config(self) -> None:
        try:
            controller = getattr(self, "runtime_policy", None)
            if controller is None:
                return
            dm = controller.dm_policy()
            aggregate_ms = max(0, int(dm.get("messageAggregateWaitSec", 12) or 12) * 1000)
            self._dm_aggregate_base_wait_ms = aggregate_ms
            self._dm_aggregate_max_wait_ms = aggregate_ms
            if str(dm.get("mode") or controller.policy.get("scheduleMode") or "").lower() == "windowed":
                # 窗口间隔由 RuntimePolicyController 控制；接口化私信内部仍需短周期
                # 推进页面模板、游标、聚合等待和 due message 处理。
                self._dm_cursor_poll_interval_ms = 6000
                self._dm_page_template_poll_interval_ms = 10000
                self._dm_tab_refresh_with_cursor_interval_ms = 30000
                self._dm_idle_poll_wait_sec = 6.0
            else:
                self._dm_cursor_poll_interval_ms = max(1000, int(dm.get("pollIntervalMinSec", 6) or 6) * 1000)
                self._dm_page_template_poll_interval_ms = max(self._dm_cursor_poll_interval_ms, int(dm.get("pollIntervalMaxSec", 10) or 10) * 1000)
                self._dm_tab_refresh_with_cursor_interval_ms = max(self._dm_page_template_poll_interval_ms, int(dm.get("shortIdleMinSec", 30) or 30) * 1000)
                self._dm_idle_poll_wait_sec = float(max(1, int(dm.get("pollIntervalMaxSec", 10) or 10)))
        except Exception as exc:
            self._log("WARN", f"视频号运行节奏配置应用失败，继续使用原有默认值：{type(exc).__name__}: {str(exc)[:120]}")

    def _runtime_policy_remaining_sec(self) -> float:
        try:
            # hard_sleep 是最高优先级：即使视频号私信仍处于游标/模板 bootstrap，
            # 也不能继续触发页面 Tab、主动轮询或处理新私信。
            hard_remaining = self._runtime_policy_hard_sleep_remaining_sec()
            if hard_remaining > 0:
                self._prepare_dm_for_hard_sleep(remaining_sec=hard_remaining)
                self._apply_runtime_policy_to_runtime_config()
                return hard_remaining

            # 非 hard_sleep 的窗口等待/普通冷却只控制“是否开始新一轮业务扫描”。
            # 视频号私信 bootstrap 仍保持短周期，避免首次游标捕获被窗口间隔延后。
            if getattr(self, "module", "") == "dm" and (self._has_queued_dm_messages() or self._dm_cursor_bootstrap_in_progress()):
                return 0.0
            controller = getattr(self, "runtime_policy", None)
            if controller is None:
                return 0.0
            remaining = max(0.0, float(controller.seconds_until_allowed() or 0.0))
            self._apply_runtime_policy_to_runtime_config()
            return remaining
        except Exception as exc:
            self._log("WARN", f"视频号运行节奏检查异常，继续本轮动作：{type(exc).__name__}: {str(exc)[:120]}")
            return 0.0

    def _runtime_policy_allows_immediate_action(self) -> bool:
        return self._runtime_policy_remaining_sec() <= 0.0

    def _sleep_runtime_policy_if_needed(self) -> bool:
        remaining = self._runtime_policy_remaining_sec()
        if remaining <= 0:
            return False
        wait_for = min(max(remaining, 1.0), 60.0)
        # Ordinary DM window/cooldown controls empty scans only. A page response with
        # a real message must wake the worker immediately. hard_sleep remains absolute.
        if getattr(self, "module", "") == "dm" and self._runtime_policy_hard_sleep_remaining_sec() <= 0:
            if self._dm_message_event.wait(wait_for):
                self._dm_message_event.clear()
                return False
            return True
        self._sleep(wait_for)
        return True

    def _comment_policy(self) -> dict[str, Any]:
        controller = getattr(self, "runtime_policy", None)
        if controller is None:
            return {}
        try:
            return controller.comment_policy()
        except Exception:
            return {}

    def _enter_comment_policy_cooldown(self, reason: str) -> None:
        cfg = self._comment_policy()
        mapping = {
            "after_comment_action": ("afterReplyCooldownMinSec", "afterReplyCooldownMaxSec", 30, 90),
            "work_done": ("workCooldownMinSec", "workCooldownMaxSec", 60, 120),
            "cycle_no_processed": ("noCandidateCooldownMinSec", "noCandidateCooldownMaxSec", 120, 300),
            "cycle_processed": ("workCooldownMinSec", "workCooldownMaxSec", 60, 120),
            "loop_error": ("errorCooldownMinSec", "errorCooldownMaxSec", 300, 600),
        }
        if reason == "full_visible_cycle_idle":
            threshold = max(1, int(cfg.get("multiEmptyRoundThreshold", 3) or 3))
            if int(getattr(self, "_comment_visible_cycle_empty_rounds", 0) or 0) >= threshold:
                self._comment_visible_cycle_empty_rounds = 0
                low_key, high_key, default_low, default_high = "multiEmptyRoundCooldownMinSec", "multiEmptyRoundCooldownMaxSec", 1200, 2400
                reason = "full_visible_cycle_multi_empty_idle"
            else:
                low_key, high_key, default_low, default_high = "roundCompletedCooldownMinSec", "roundCompletedCooldownMaxSec", 600, 1200
        else:
            low_key, high_key, default_low, default_high = mapping.get(reason, ("workCooldownMinSec", "workCooldownMaxSec", 60, 120))
        self._enter_comment_cooldown(
            reason,
            min_sec=float(cfg.get(low_key, default_low) or default_low),
            max_sec=float(cfg.get(high_key, default_high) or default_high),
        )

    def _sleep(self, seconds: float) -> bool:
        deadline = time.monotonic() + max(0.1, float(seconds or 0.0))
        while not self._stop_event.is_set():
            if bool(getattr(self, "_interface_paused_for_login", False)):
                return True
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return False
            if self._stop_event.wait(min(0.5, remaining)):
                return True
        return True

    def _comment_processed_reply_statuses(self) -> set[str]:
        # generated/failed 不能视为已完成；只有无需回复或已真实发送才跳过后端判断。
        return {"not_required", "no_reply", "skipped", "ignore", "ignored", "sent", "sent_unconfirmed", "replied", "success", "succeeded", "done", "manual_sent"}

    def _comment_record_is_processed(self, record: dict[str, Any] | None) -> bool:
        if not isinstance(record, dict) or not record:
            return False
        status = normalize_text(record.get("reply_status") or record.get("replyStatus"), 40).lower()
        # 原始旁路采集会写入 pending + shouldReply=false；这只表示“尚未判断”，
        # 不能把它当成无需回复，否则接口已经捕获到的新评论会在工作流前被静默跳过。
        if status:
            return status in self._comment_processed_reply_statuses()
        # 兼容极旧记录：只有明确 skipReply=true 才算已完成；单独 shouldReply=false 不够。
        return bool(record.get("skip_reply") or record.get("skipReply"))

    def _log_comment_decision(self, key: str, message: str, *, interval_sec: float = 45.0, level: str = "INFO") -> None:
        now = time.monotonic()
        last = float(self._comment_decision_log_at.get(key, 0.0) or 0.0)
        if last and now - last < max(1.0, float(interval_sec or 0.0)):
            return
        self._comment_decision_log_at[key] = now
        self._log(level, message)

    @staticmethod
    def _comment_log_preview(value: Any, limit: int = 120) -> str:
        return normalize_text(value, max(20, int(limit or 120)))

    def _lookup_existing_comment_record(self, *, platform: str, record_id: str, user_nickname: str, comment_content: str) -> dict[str, Any]:
        if not self.core_service:
            return {}
        record_id = normalize_text(record_id, 240)
        user_nickname = normalize_text(user_nickname, 120)
        comment_content = normalize_text(comment_content, 2000)
        if not record_id and not (user_nickname and comment_content):
            return {}

        def _match_processed(items: list[Any]) -> dict[str, Any]:
            for item in items:
                if not isinstance(item, dict):
                    continue
                item_record_id = normalize_text(item.get("record_id") or item.get("recordId"), 240)
                item_user = normalize_text(item.get("user_nickname") or item.get("userNickname"), 120)
                item_content = normalize_text(item.get("comment_content") or item.get("commentContent"), 2000)
                matched = bool(record_id and item_record_id == record_id) or bool(user_nickname and comment_content and item_user == user_nickname and item_content == comment_content)
                if matched and self._comment_record_is_processed(item):
                    return item
            return {}

        def _lookup(payload: dict[str, Any]) -> list[Any]:
            if not hasattr(self.core_service, "lookup_comment_records"):
                return []
            response = self.core_service.lookup_comment_records(payload)
            raw_items = response.get("items") if isinstance(response, dict) else []
            return raw_items if isinstance(raw_items, list) else []

        lookup_errors: list[str] = []
        platform_candidates = [platform]
        lower_platform = platform.lower()
        if lower_platform and lower_platform not in platform_candidates:
            platform_candidates.append(lower_platform)
        for platform_value in platform_candidates:
            primary_payload = {
                "robotId": self.account.id,
                "platform": platform_value,
                "records": [{
                    "recordId": record_id or None,
                    "userNickname": user_nickname or None,
                    "commentContent": comment_content or None,
                }],
            }
            try:
                found = _match_processed(_lookup(primary_payload))
                if found:
                    return found
            except Exception as exc:
                lookup_errors.append(f"primary[{platform_value}]:{type(exc).__name__}:{str(exc)[:100]}")

        # 二次兜底：同一租户下按“平台 + 客户昵称 + 评论内容”精确复用已处理结果。
        # 只返回 not_required / skipped / sent 等已完成记录，不会把 generated/failed 当成已完成。
        if user_nickname and comment_content and not record_id:
            relaxed_payload = {
                "platform": platform,
                "records": [{
                    "recordId": None,
                    "userNickname": user_nickname,
                    "commentContent": comment_content,
                }],
            }
            try:
                found = _match_processed(_lookup(relaxed_payload))
                if found:
                    return found
            except Exception as exc:
                lookup_errors.append(f"relaxed:{type(exc).__name__}:{str(exc)[:100]}")

        if record_id and hasattr(self.core_service, "list_comment_records"):
            for platform_value in platform_candidates:
                try:
                    fallback = self.core_service.list_comment_records(robot_id=self.account.id, platform=platform_value, record_id=record_id, page_size=5)
                    raw_items = fallback.get("items") if isinstance(fallback, dict) else []
                    found = _match_processed(raw_items if isinstance(raw_items, list) else [])
                    if found:
                        return found
                except Exception as exc:
                    lookup_errors.append(f"list_by_record[{platform_value}]:{type(exc).__name__}:{str(exc)[:100]}")

        if user_nickname and comment_content and not record_id and hasattr(self.core_service, "list_comment_records"):
            try:
                fallback = self.core_service.list_comment_records(robot_id="", platform=platform, record_id="", page_size=80)
                raw_items = fallback.get("items") if isinstance(fallback, dict) else []
                found = _match_processed(raw_items if isinstance(raw_items, list) else [])
                if found:
                    return found
            except Exception as exc:
                lookup_errors.append(f"list_by_customer:{type(exc).__name__}:{str(exc)[:100]}")

        if lookup_errors:
            self._log("WARN", f"视频号评论已处理记录查询未命中或部分失败，继续走原流程：{' | '.join(lookup_errors)[:240]}")
        return {}

    def _enter_comment_cooldown(self, reason: str, *, min_sec: float | None = None, max_sec: float | None = None, duration_sec: float | None = None) -> None:
        try:
            if duration_sec is None:
                low = float(min_sec if min_sec is not None else 0.0)
                high = float(max_sec if max_sec is not None else low)
                if high < low:
                    high = low
                duration_sec = random.uniform(max(0.0, low), max(0.0, high))
            duration = max(0.0, float(duration_sec or 0.0))
            if duration <= 0:
                return
            now = time.monotonic()
            until = now + duration
            # Longer cooldown wins. Do not let a short per-work cooldown shorten a full-cycle rest.
            if until < float(getattr(self, "_comment_cooldown_until_monotonic", 0.0) or 0.0):
                return
            self._comment_cooldown_until_monotonic = until
            self._comment_cooldown_reason = str(reason or "")
            self._comment_last_cooldown_log_monotonic = now
            self._log("INFO", f"视频号评论进入节奏冷却：{json.dumps({'reason': reason, 'durationSec': round(duration, 1)}, ensure_ascii=False)}")
        except Exception as exc:
            self._log("WARN", f"视频号评论节奏冷却设置失败：{type(exc).__name__}: {str(exc)[:120]}")

    def _comment_cooldown_remaining_sec(self) -> float:
        until = float(getattr(self, "_comment_cooldown_until_monotonic", 0.0) or 0.0)
        if until <= 0:
            return 0.0
        remaining = until - time.monotonic()
        if remaining <= 0:
            self._comment_cooldown_until_monotonic = 0.0
            reason = self._comment_cooldown_reason
            self._comment_cooldown_reason = ""
            self._log("INFO", f"视频号评论节奏冷却结束：{json.dumps({'reason': reason}, ensure_ascii=False)}")
            return 0.0
        return remaining

    def _sleep_comment_cooldown_if_needed(self) -> bool:
        remaining = self._comment_cooldown_remaining_sec()
        if remaining <= 0:
            return False
        now = time.monotonic()
        if now - float(getattr(self, "_comment_last_cooldown_log_monotonic", 0.0) or 0.0) >= 30.0:
            self._comment_last_cooldown_log_monotonic = now
            self._log("INFO", f"视频号评论节奏冷却中：{json.dumps({'reason': self._comment_cooldown_reason, 'remainingSec': int(remaining + 0.999)}, ensure_ascii=False)}")
        self._sleep(min(max(remaining, 1.0), 60.0))
        return True

    def _run_comment_loop(self, client: WeChatVideoApiClient, runtime: WeChatVideoRuntime, generation: int) -> None:
        userpage_types = [13, 12]
        while self._interface_loop_active(generation):
            if self._sleep_runtime_policy_if_needed():
                continue
            if self._sleep_comment_cooldown_if_needed():
                continue
            cycle_posts = 0
            cycle_candidates = 0
            cycle_targets = 0
            cycle_processed = 0
            cycle_had_errors = False
            try:
                for userpage_type in userpage_types:
                    if not self._interface_loop_active(generation):
                        break
                    posts = client.list_posts(userpage_type)
                    cycle_posts += len(posts)
                    candidates = [
                        item for item in posts
                        if int(item.get("commentClose") or 0) == 0 and int(item.get("commentCount") or 0) > 0
                    ][:5]
                    cycle_candidates += len(candidates)
                    self._log("INFO", f"视频号评论轮询：type={userpage_type} posts={len(posts)} candidates={len(candidates)}")
                    for post in candidates:
                        if not self._interface_loop_active(generation):
                            break
                        export_id = normalize_text(post.get("exportId"), 180)
                        if not export_id:
                            continue
                        comments = client.list_comments(export_id)
                        try:
                            self._comment_recording.observe_post_comments(post, comments, runtime.finder_username)
                        except Exception as exc:
                            self._log("WARN", f"视频号评论旁路记录异常，继续原处理链：{type(exc).__name__}: {str(exc)[:160]}")
                        targets, delayed = pick_comment_reply_targets(comments, runtime.finder_username)
                        cycle_targets += len(targets)
                        post_title = normalize_text(post.get("description") or post.get("title") or export_id, 180)
                        self._log("INFO", f"视频号评论候选扫描: {json.dumps({'postTitle': post_title, 'exportId': export_id, 'rootThreads': len(comments), 'structuralTargets': len(targets), 'trivialDelayed': len(delayed)}, ensure_ascii=False)}")
                        for candidate in targets[:3]:
                            candidate_root = candidate.get("root") if isinstance(candidate.get("root"), dict) else {}
                            candidate_target = candidate.get("target") if isinstance(candidate.get("target"), dict) else candidate_root
                            self._log("INFO", f"视频号评论识别到待判断评论: {json.dumps({'postTitle': post_title, 'author': normalize_text(candidate_target.get('nickname') or candidate_target.get('username'), 120), 'content': normalize_text(candidate_target.get('commentContent'), 220), 'rootCommentId': normalize_text(candidate_root.get('commentId'), 120), 'targetCommentId': normalize_text(candidate_target.get('commentId'), 120), 'level': self._comment_recording.logical_depth(candidate_root, candidate_target) + 1, 'candidateReason': normalize_text(candidate.get('reason'), 80)}, ensure_ascii=False)}")
                        for candidate in delayed[:3]:
                            delayed_root = candidate.get("root") if isinstance(candidate.get("root"), dict) else {}
                            delayed_target = candidate.get("target") if isinstance(candidate.get("target"), dict) else delayed_root
                            self._log("INFO", f"视频号评论暂缓处理: {json.dumps({'postTitle': post_title, 'author': normalize_text(delayed_target.get('nickname') or delayed_target.get('username'), 120), 'content': normalize_text(delayed_target.get('commentContent'), 220), 'targetCommentId': normalize_text(delayed_target.get('commentId'), 120), 'reason': normalize_text(candidate.get('reason') or 'trivial_short_message', 80)}, ensure_ascii=False)}")
                        post_processed = 0
                        for item in targets[:3]:
                            if not self._interface_loop_active(generation):
                                break
                            try:
                                if self._handle_comment_target(client, runtime, post, item):
                                    post_processed += 1
                                    cycle_processed += 1
                                    self._enter_comment_policy_cooldown("after_comment_action")
                            except Exception as exc:
                                cycle_had_errors = True
                                self._log("WARN", f"视频号评论单条处理异常：{type(exc).__name__}: {str(exc)[:180]}")
                            if self._sleep_comment_cooldown_if_needed():
                                pass
                        if post_processed > 0:
                            self._enter_comment_policy_cooldown("work_done")
                            self._sleep_comment_cooldown_if_needed()
                        else:
                            self._sleep(4.0)
                if not self._interface_loop_active(generation):
                    break
                self._log("INFO", f"视频号评论本轮处理汇总: {json.dumps({'posts': cycle_posts, 'postsWithComments': cycle_candidates, 'structuralTargets': cycle_targets, 'handled': cycle_processed, 'hadErrors': cycle_had_errors}, ensure_ascii=False)}")
                if cycle_processed <= 0 and cycle_targets <= 0 and not cycle_had_errors:
                    self._comment_visible_cycle_empty_rounds += 1
                    # 已扫过当前可见作品且没有待处理候选：进入 10-20 分钟随机休息，降低浏览器/接口压力。
                    self._enter_comment_policy_cooldown("full_visible_cycle_idle")
                elif cycle_processed <= 0:
                    self._enter_comment_policy_cooldown("cycle_no_processed")
                else:
                    self._comment_visible_cycle_empty_rounds = 0
                    self._enter_comment_policy_cooldown("cycle_processed")
            except Exception as exc:
                self._log("WARN", f"视频号评论轮询异常：{type(exc).__name__}: {str(exc)[:180]}")
                self._enter_comment_policy_cooldown("loop_error")
            self._sleep_comment_cooldown_if_needed()

    def _confirm_wechat_comment_reply(
        self,
        client: WeChatVideoApiClient,
        runtime: WeChatVideoRuntime,
        *,
        export_id: str,
        root_comment_id: str,
        target_comment: dict[str, Any],
        expected_reply: str,
        before_message_count: int,
        before_comment_ids: set[str],
    ) -> tuple[bool, dict[str, Any], str]:
        expected = normalize_text(expected_reply, 2000)
        target_ts = 0
        try:
            target_ts = int(float(target_comment.get("commentCreatetime") or target_comment.get("createTime") or target_comment.get("ts") or 0))
        except Exception:
            target_ts = 0
        for attempt_no, wait_sec in enumerate((1.5, 3.0, 5.0), start=1):
            if self._stop_event.wait(wait_sec):
                return False, {}, "stopped"
            try:
                roots = client.list_comments(export_id)
            except Exception as exc:
                self._log("WARN", f"视频号评论发送后确认读取失败：attempt={attempt_no} {type(exc).__name__}: {str(exc)[:140]}")
                continue
            for root in roots:
                if not isinstance(root, dict) or normalize_text(root.get("commentId"), 180) != root_comment_id:
                    continue
                nodes = root.get("levelTwoComment") if isinstance(root.get("levelTwoComment"), list) else []
                after_message_count = 1 + len(nodes)
                if after_message_count <= max(0, int(before_message_count or 0)):
                    continue
                for node in nodes:
                    if not isinstance(node, dict):
                        continue
                    node_id = normalize_text(node.get("commentId"), 220)
                    if not node_id or node_id in before_comment_ids:
                        continue
                    if normalize_text(node.get("username"), 220) != normalize_text(runtime.finder_username, 220):
                        continue
                    if normalize_text(node.get("commentContent"), 2000) != expected:
                        continue
                    try:
                        node_ts = int(float(node.get("commentCreatetime") or node.get("createTime") or node.get("ts") or 0))
                    except Exception:
                        node_ts = 0
                    if target_ts and node_ts and node_ts < target_ts:
                        continue
                    self._log("INFO", f"视频号评论严格确认成功: {json.dumps({'beforeMessageCount': before_message_count, 'afterMessageCount': after_message_count, 'newReplyId': node_id}, ensure_ascii=False)}")
                    return True, node, "platform_readback_after_target_with_draft_match"
        return False, {}, "platform_api_ack_without_readback"

    def _handle_comment_target(self, client: WeChatVideoApiClient, runtime: WeChatVideoRuntime, post: dict[str, Any], item: dict[str, Any]) -> bool:
        root = item.get("root") if isinstance(item.get("root"), dict) else {}
        target = item.get("target") if isinstance(item.get("target"), dict) else root
        export_id = normalize_text(post.get("exportId"), 180)
        root_id = normalize_text(root.get("commentId"), 180)
        target_id = normalize_text(target.get("commentId"), 180)
        content = normalize_text(target.get("commentContent"), 2000)
        key = f"{export_id}:{target_id}"
        author = normalize_text(target.get("nickname") or target.get("username"), 120)
        post_title = normalize_text(post.get("description") or post.get("title") or export_id, 180)
        log_base = {
            "postTitle": post_title,
            "author": author,
            "content": normalize_text(content, 220),
            "rootCommentId": root_id,
            "targetCommentId": target_id,
            "level": self._comment_recording.logical_depth(root, target) + 1 if root else 1,
            "candidateReason": normalize_text(item.get("reason"), 80),
        }
        missing = [name for name, value in (("exportId", export_id), ("rootCommentId", root_id), ("targetCommentId", target_id), ("content", content)) if not value]
        if missing:
            self._log_comment_decision(f"invalid:{key}:{','.join(missing)}", f"视频号评论候选字段不完整，无法处理: {json.dumps({**log_base, 'missing': missing}, ensure_ascii=False)}", interval_sec=60.0, level="WARN")
            return False
        if key in self._processed_comment_ids:
            self._log_comment_decision(f"memory_processed:{key}", f"视频号评论已在本次运行中完成处理，跳过重复工作流: {json.dumps(log_base, ensure_ascii=False)}")
            return False
        retry_after = float(self._comment_retry_after.get(key, 0.0) or 0.0)
        retry_remaining = retry_after - time.monotonic()
        if retry_remaining > 0:
            self._log_comment_decision(f"retry_wait:{key}", f"视频号评论等待技术重试: {json.dumps({**log_base, 'remainingSec': int(retry_remaining + 0.999)}, ensure_ascii=False)}", interval_sec=10.0)
            return False
        self._log("INFO", f"视频号评论准备进入处理链: {json.dumps(log_base, ensure_ascii=False)}")
        existing_record = self._lookup_existing_comment_record(
            platform="WECHAT_VIDEO",
            record_id=self._comment_recording.record_id(target),
            user_nickname=normalize_text(target.get("nickname") or target.get("username"), 120),
            comment_content=content,
        )
        if not existing_record:
            # Compatibility with the pre-F1 视频号 comment writer, which stored raw commentId.
            existing_record = self._lookup_existing_comment_record(
                platform="WECHAT_VIDEO",
                record_id=target_id,
                user_nickname=normalize_text(target.get("nickname") or target.get("username"), 120),
                comment_content=content,
            )
        if existing_record:
            self._processed_comment_ids.add(key)
            status = normalize_text(existing_record.get("reply_status") or existing_record.get("replyStatus"), 40) or "processed"
            self._log("INFO", f"视频号评论已存在明确完成记录，跳过工作流: {json.dumps({**log_base, 'status': status}, ensure_ascii=False)}")
            return True

        try:
            thread_id, thread_context, context_source = self._comment_recording.build_thread_context(root, target, runtime.finder_username)
        except Exception as exc:
            thread_id, thread_context, context_source = self._comment_recording.root_record_id(root), [], "none"
            self._log("WARN", f"视频号评论上下文读取失败，降级为无上下文：{type(exc).__name__}: {str(exc)[:140]}")
        self._log("INFO", f"视频号评论上下文准备完成: {json.dumps({**log_base, 'threadId': thread_id, 'contextCount': len(thread_context), 'contextSource': context_source}, ensure_ascii=False)}")
        target_record_id = self._comment_recording.record_id(target)
        attempt_seed = f"{getattr(self.account, 'id', '')}:{target_record_id}:comment-reply"
        attempt_id = f"wx_comment_attempt_{uuid.uuid5(uuid.NAMESPACE_URL, attempt_seed).hex}"
        payload = build_comment_test_payload(
            self.account,
            content,
            comment_thread_id=thread_id,
            thread_context=thread_context,
            context_source=context_source,
        )
        payload.update({
            "platform": "微信视频号评论区",
            "postContext": normalize_text(post.get("description") or post.get("title"), 500),
            "replyAttemptId": attempt_id,
            "customerMessageId": target_record_id,
        })
        self._log("INFO", f"视频号评论工作流调用开始: {json.dumps({**log_base, 'threadId': thread_id, 'attemptId': attempt_id, 'contextCount': len(thread_context), 'contextSource': context_source}, ensure_ascii=False)}")
        response = self.core_service.runtime_comment_reply(payload) if self.core_service else {}
        response_status = normalize_text(response.get("replyStatus"), 40).lower()
        should_reply = response.get("shouldReply") is True and not response.get("skipReply")
        reply = normalize_text(response.get("reply"), 2000)
        self._log("INFO", f"视频号评论工作流判断完成: {json.dumps({**log_base, 'source': normalize_text(response.get('source'), 80), 'replyStatus': response_status or 'unknown', 'shouldReply': should_reply, 'skipReply': bool(response.get('skipReply')), 'replyPreview': normalize_text(reply, 160), 'reason': normalize_text(response.get('skipReason') or response.get('judgeReason') or response.get('failReason'), 240)}, ensure_ascii=False)}")
        reply_trace_id = normalize_text(response.get("replyTraceId"), 512)
        generation_source = normalize_text(response.get("source") or response.get("generationSource"), 64)
        common_outcome = {
            "replyAttemptId": attempt_id,
            "replyTraceId": reply_trace_id,
            "generationSource": generation_source,
            "commentType": normalize_text(response.get("commentType") or "wechat_video_comment", 80),
            "intentLevel": normalize_text(response.get("intentLevel") or "none", 32),
            "intentLabel": intent_label(normalize_text(response.get("intentLevel") or "none", 32)),
            "judgeReason": normalize_text(response.get("judgeReason"), 800),
        }
        if response_status == "failed":
            reason = normalize_text(response.get("failReason") or response.get("skipReason") or "评论工作流调用失败", 800)
            self._comment_recording.update_target_outcome(post, root, target, runtime.finder_username, outcome={
                **common_outcome, "shouldReply": False, "skipReply": False, "replyStatus": "failed", "failReason": reason,
            })
            self._comment_retry_after[key] = time.monotonic() + 30.0
            self._log("WARN", f"视频号评论工作流失败，30秒后允许重试: {json.dumps({**log_base, 'reason': reason[:240]}, ensure_ascii=False)}")
            return False
        if not should_reply or not reply:
            reason = normalize_text(response.get("skipReason") or response.get("judgeReason") or "后端判断无需回复", 500)
            self._comment_recording.update_target_outcome(post, root, target, runtime.finder_username, outcome={
                **common_outcome, "shouldReply": False, "skipReply": True, "skipReason": reason, "replyStatus": "not_required",
            })
            self._processed_comment_ids.add(key)
            self._log("INFO", f"视频号评论后端判定无需回复: {json.dumps({**log_base, 'reason': reason[:240], 'replyStatus': response_status or 'not_required'}, ensure_ascii=False)}")
            return True

        self._comment_recording.record_reply_attempt(
            attempt_id=attempt_id,
            target_record_id=target_record_id,
            draft_text=reply,
            actual_text="",
            status="send_pending",
            reply_trace_id=reply_trace_id,
            generation_source=generation_source,
        )
        self._log("INFO", f"视频号评论准备调用平台回复接口: {json.dumps({**log_base, 'attemptId': attempt_id, 'draft': normalize_text(reply, 220), 'contextCount': len(thread_context)}, ensure_ascii=False)}")
        try:
            result = client.reply_comment(
                export_id=export_id,
                root_comment_id=root_id,
                reply_comment_id=target_id,
                content=reply,
                target_comment_raw=target,
            )
            api_ok = int(result.get("errCode") or result.get("errcode") or 0) == 0
        except Exception as exc:
            result = {"error": f"{type(exc).__name__}: {str(exc)[:500]}"}
            api_ok = False
        if not api_ok:
            fail_reason = normalize_text(result, 800)
            self._comment_recording.record_reply_attempt(
                attempt_id=attempt_id, target_record_id=target_record_id, draft_text=reply, actual_text="", status="send_failed", error_code="platform_api_failed", error_message=fail_reason,
                reply_trace_id=reply_trace_id, generation_source=generation_source
            )
            self._comment_recording.update_target_outcome(post, root, target, runtime.finder_username, outcome={
                **common_outcome, "shouldReply": True, "skipReply": False, "replyStatus": "failed", "replyContent": reply, "failReason": fail_reason,
            })
            self._comment_retry_after[key] = time.monotonic() + 60.0
            self._log("WARN", f"视频号评论回复接口失败，60秒后允许重试: {json.dumps({**log_base, 'attemptId': attempt_id, 'reason': fail_reason[:260]}, ensure_ascii=False)}")
            return False

        before_nodes = [root, *[node for node in (root.get("levelTwoComment") or []) if isinstance(node, dict)]]
        before_comment_ids = {normalize_text(node.get("commentId"), 220) for node in before_nodes if normalize_text(node.get("commentId"), 220)}
        before_message_count = len(before_nodes)
        confirmed, confirmed_node, confirm_mode = self._confirm_wechat_comment_reply(
            client,
            runtime,
            export_id=export_id,
            root_comment_id=root_id,
            target_comment=target,
            expected_reply=reply,
            before_message_count=before_message_count,
            before_comment_ids=before_comment_ids,
        )
        reply_status = "sent" if confirmed else "sent_unconfirmed"
        self._comment_recording.record_reply_attempt(
            attempt_id=attempt_id, target_record_id=target_record_id, draft_text=reply, actual_text=reply, status="sent" if confirmed else "send_unconfirmed", confirmed=confirmed,
            reply_trace_id=reply_trace_id, generation_source=generation_source
        )
        self._comment_recording.update_target_outcome(post, root, target, runtime.finder_username, outcome={
            **common_outcome,
            "shouldReply": True,
            "skipReply": False,
            "replyStatus": reply_status,
            "replyContent": reply,
            "replyTime": current_time_text(),
            "failReason": "" if confirmed else "平台接口已成功，但本轮未读取到匹配回显；为防重复发送已标记待确认。",
        })
        if confirmed_node:
            try:
                refreshed = client.list_comments(export_id)
                self._comment_recording.observe_post_comments(post, refreshed, runtime.finder_username)
            except Exception:
                pass
        self._processed_comment_ids.add(key)
        self._comment_retry_after.pop(key, None)
        self._log("INFO", f"视频号评论回复完成: {json.dumps({**log_base, 'attemptId': attempt_id, 'status': reply_status, 'confirmMode': confirm_mode, 'contextCount': len(thread_context), 'reply': normalize_text(reply, 220)}, ensure_ascii=False)}")
        return True

    def _sync_comment(self, client: WeChatVideoApiClient, post: dict[str, Any], root: dict[str, Any], target: dict[str, Any], *, should_reply: bool, skip: bool, reason: str, backend: dict[str, Any], reply: str = "", failed: bool = False, fail_reason: str = "") -> None:
        if not self.core_service:
            return
        root_id = normalize_text(root.get("commentId"), 180)
        target_id = normalize_text(target.get("commentId"), 180)
        content = normalize_text(target.get("commentContent"), 2000)
        intent_level = normalize_text(backend.get("intentLevel") or ("none" if skip else "medium"), 32)
        payload = {
            "robotId": self.account.id,
            "module": "comment",
            "platform": "wechat_video",
            "botNickname": self.account.robot_name,
            "postTitle": normalize_text(post.get("description") or post.get("title") or post.get("exportId"), 300),
            "comments": [{
                "recordId": target_id,
                "rootRecordId": root_id or target_id,
                "parentRecordId": root_id if root_id != target_id else None,
                "depth": 0 if root_id == target_id else 1,
                "userNickname": normalize_text(target.get("nickname") or target.get("username"), 120),
                "commentContent": content,
                "commentTime": current_time_text(),
                "shouldReply": bool(should_reply),
                "skipReply": bool(skip),
                "skipReason": reason if skip else "",
                "commentType": normalize_text(backend.get("commentType") or "wechat_video_comment", 80),
                "intentLevel": intent_level,
                "intentLabel": intent_label(intent_level),
                "judgeReason": normalize_text(backend.get("judgeReason") or reason, 800),
                "replyStatus": "failed" if failed else "not_required" if skip else "sent",
                "replyContent": "" if skip else reply,
                "replyTime": "" if skip or failed else current_time_text(),
                "failReason": fail_reason,
            }],
        }
        try:
            self.core_service.sync_comment_records(payload)
        except Exception as exc:
            self._log("WARN", f"视频号评论同步后端失败：{type(exc).__name__}: {str(exc)[:160]}")

    def _dm_message_key(self, msg: dict[str, Any]) -> str:
        session_id = normalize_text(msg.get("sessionId"), 180)
        msg_id = normalize_text(msg.get("msgId"), 180)
        return f"{session_id}:{msg_id}" if session_id and msg_id else ""

    def _dm_message_sort_key(self, msg: dict[str, Any]) -> tuple[int, int, str]:
        try:
            ts = int(float(msg.get("ts") or 0))
        except Exception:
            ts = 0
        try:
            seq = int(float(((msg.get("raw") or {}) if isinstance(msg.get("raw"), dict) else {}).get("seq") or msg.get("msgId") or 0))
        except Exception:
            seq = 0
        return (ts, seq, str(msg.get("msgId") or ""))

    def _queue_dm_message_for_aggregate(self, msg: dict[str, Any]) -> None:
        """Delay DM replies so consecutive short user messages can be handled together.

        This mirrors the stable Douyin DM behavior: the first detected incoming message
        opens a quiet window; if the same user sends more content before the quiet window
        ends, the window is refreshed and the backend receives the combined dialogue.
        """
        session_id = normalize_text(msg.get("sessionId"), 180)
        key = self._dm_message_key(msg)
        text = normalize_text(msg.get("text"), 2000)
        if not session_id or not key or not text:
            return
        if key in self._processed_dm_ids or key in self._dm_retry_exhausted_ids:
            return
        now = int(time.monotonic() * 1000)
        raw = msg.get("raw") if isinstance(msg.get("raw"), dict) else {}
        try:
            observed_at = int(raw.get("_ucpCapturedMonotonicMs") or msg.get("_ucpCapturedMonotonicMs") or now)
        except Exception:
            observed_at = now
        observed_at = min(now, max(0, observed_at))
        base_wait = max(0, int(self._dm_aggregate_base_wait_ms or 0))
        max_wait = max(base_wait, int(self._dm_aggregate_max_wait_ms or base_wait))
        window = self._dm_aggregate_windows.get(session_id)
        if not isinstance(window, dict):
            window = {
                "sessionId": session_id,
                "messages": [],
                "messageKeys": set(),
                "startedAt": observed_at,
                "lastChangeAt": observed_at,
                "releaseAt": max(now, observed_at + base_wait),
                "deadlineAt": max(now, observed_at + max_wait),
                "resetCount": 0,
                "lastLogAt": 0,
            }
            self._dm_aggregate_windows[session_id] = window
            self._log(
                "INFO",
                "视频号私信聚合等待启动："
                + json.dumps({
                    "session": session_id,
                    "baseWaitMs": base_wait,
                    "maxWaitMs": max_wait,
                    "text": text[:50],
                }, ensure_ascii=False),
            )
        keys = window.get("messageKeys")
        if not isinstance(keys, set):
            keys = set(str(item) for item in keys or [])
            window["messageKeys"] = keys
        if key in keys:
            return
        keys.add(key)
        messages = window.get("messages")
        if not isinstance(messages, list):
            messages = []
            window["messages"] = messages
        messages.append(msg)
        messages.sort(key=self._dm_message_sort_key)

        previous_count = max(0, len(messages) - 1)
        if previous_count:
            started_at = int(window.get("startedAt", observed_at) or observed_at)
            deadline_at = int(window.get("deadlineAt", started_at + max_wait) or (started_at + max_wait))
            release_at = min(max(now, observed_at + base_wait), deadline_at)
            window["lastChangeAt"] = now
            window["releaseAt"] = release_at
            window["resetCount"] = int(window.get("resetCount", 0) or 0) + 1
            self._log(
                "INFO",
                "视频号私信聚合等待刷新："
                + json.dumps({
                    "session": session_id,
                    "messageCount": len(messages),
                    "remainingMs": max(0, release_at - now),
                    "resetCount": int(window.get("resetCount", 0) or 0),
                    "latest": text[:50],
                }, ensure_ascii=False),
            )

    def _pop_due_dm_aggregate_messages(self) -> list[dict[str, Any]]:
        now = int(time.monotonic() * 1000)
        due: list[dict[str, Any]] = []
        for session_id, window in list(self._dm_aggregate_windows.items()):
            if not isinstance(window, dict):
                self._dm_aggregate_windows.pop(session_id, None)
                continue
            messages = window.get("messages") if isinstance(window.get("messages"), list) else []
            if not messages:
                self._dm_aggregate_windows.pop(session_id, None)
                continue
            release_at = int(window.get("releaseAt", now) or now)
            deadline_at = int(window.get("deadlineAt", release_at) or release_at)
            effective_release_at = min(release_at, deadline_at)
            if now < effective_release_at:
                last_log_at = int(window.get("lastLogAt", 0) or 0)
                if now - last_log_at >= 2500:
                    window["lastLogAt"] = now
                    self._log(
                        "INFO",
                        "视频号私信聚合等待中："
                        + json.dumps({
                            "session": session_id,
                            "messageCount": len(messages),
                            "remainingMs": max(0, effective_release_at - now),
                        }, ensure_ascii=False),
                    )
                continue
            self._dm_aggregate_windows.pop(session_id, None)
            merged = self._build_aggregate_dm_message(messages)
            if merged:
                due.append(merged)
        return due

    def _build_aggregate_dm_message(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        valid = [m for m in messages if isinstance(m, dict) and self._dm_message_key(m) and self._dm_message_key(m) not in self._processed_dm_ids]
        if not valid:
            return {}
        valid.sort(key=self._dm_message_sort_key)
        latest = dict(valid[-1])
        texts: list[str] = []
        keys: list[str] = []
        raw_ids: list[str] = []
        for item in valid:
            text = normalize_text(item.get("text"), 2000)
            key = self._dm_message_key(item)
            if text:
                texts.append(text)
            if key:
                keys.append(key)
            msg_id = normalize_text(item.get("msgId"), 180)
            if msg_id:
                raw_ids.append(msg_id)
        if not texts:
            return {}
        latest["text"] = "\n".join(texts)
        latest["_aggregateMessages"] = valid
        latest["_aggregateMessageKeys"] = keys
        latest["_aggregateMsgIds"] = raw_ids
        latest["_aggregateCount"] = len(valid)
        return latest

    def _dm_aggregate_wait_seconds(self, default: float = 8.0) -> float:
        if not self._dm_aggregate_windows:
            return default
        now = int(time.monotonic() * 1000)
        waits: list[float] = []
        for window in self._dm_aggregate_windows.values():
            if not isinstance(window, dict):
                continue
            release_at = int(window.get("releaseAt", now) or now)
            deadline_at = int(window.get("deadlineAt", release_at) or release_at)
            effective = min(release_at, deadline_at)
            waits.append(max(0.2, (effective - now) / 1000.0))
        if not waits:
            return default
        return max(0.2, min(default, min(waits)))

    def _apply_cached_dm_session_info(self, raw_messages: list[dict[str, Any]]) -> None:
        with self._dm_session_info_lock:
            cache = dict(self._dm_session_info_cache)
        for item in raw_messages:
            if not isinstance(item, dict):
                continue
            session_id = normalize_text(item.get("sessionId"), 180)
            if session_id and session_id in cache:
                item["_sessionInfo"] = dict(cache[session_id])

    def _schedule_dm_session_info_refresh(
        self,
        client: WeChatVideoApiClient,
        session_ids: list[str],
        raw_messages: list[dict[str, Any]] | None = None,
    ) -> None:
        unique = [item for item in dict.fromkeys(normalize_text(value, 180) for value in session_ids) if item]
        if not unique:
            return
        with self._dm_session_info_lock:
            missing = [item for item in unique if item not in self._dm_session_info_cache and item not in self._dm_session_info_pending]
            self._dm_session_info_pending.update(missing)
        if not missing:
            return
        snapshots = [dict(item) for item in (raw_messages or []) if isinstance(item, dict) and normalize_text(item.get("sessionId"), 180) in missing]

        def worker() -> None:
            try:
                info_map = client.get_session_info(missing)
                if isinstance(info_map, dict):
                    with self._dm_session_info_lock:
                        for session_id, info in info_map.items():
                            if isinstance(info, dict):
                                self._dm_session_info_cache[str(session_id)] = dict(info)
                    if snapshots:
                        for item in snapshots:
                            session_id = normalize_text(item.get("sessionId"), 180)
                            if session_id in info_map and isinstance(info_map[session_id], dict):
                                item["_sessionInfo"] = dict(info_map[session_id])
                        normalized = [message_from_wx_private(item) for item in snapshots]
                        try:
                            self._dm_recording.observe_messages(normalized, source="session_info_refresh", tab="资料补全")
                            self._dm_recording.sync_session_metadata(normalized)
                        except Exception as exc:
                            self._log("INFO", f"视频号私信联系人资料回写暂未完成：{type(exc).__name__}: {str(exc)[:100]}")
            except Exception as exc:
                self._log("INFO", f"视频号私信会话资料后台补全暂未完成：{type(exc).__name__}: {str(exc)[:120]}")
            finally:
                with self._dm_session_info_lock:
                    for session_id in missing:
                        self._dm_session_info_pending.discard(session_id)

        threading.Thread(target=worker, name=f"wx-video-session-info-{self.account.id[:8]}", daemon=True).start()

    def _collect_pre_send_dm_messages(
        self,
        client: WeChatVideoApiClient,
        session_id: str,
        existing_keys: list[str],
        *,
        wait_sec: float = 3.2,
    ) -> list[dict[str, Any]]:
        """Force one final get-new-msg poll before sending a generated reply.

        Messages arriving while Core/Coze is generating must not automatically become a
        second immediate bot reply.  A final page-context poll drains the same session;
        when new user messages exist, the stale draft is discarded and the expanded
        batch is regenerated after a short quiet window.
        """
        if not session_id or not self._has_any_valid_dm_cursor() or self._dm_hard_sleep_blocks_interface_actions():
            return []
        existing = set(str(item) for item in existing_keys if str(item))
        collected: dict[str, dict[str, Any]] = {}
        self.pre_send_cursor_poll_requested.emit()
        deadline = time.monotonic() + max(0.8, float(wait_sec))
        while self._interface_loop_active() and time.monotonic() < deadline:
            remaining = max(0.0, deadline - time.monotonic())
            self._dm_message_event.wait(min(0.55, remaining))
            self._dm_message_event.clear()
            raw_messages = self._consume_page_private_messages()
            if not raw_messages:
                continue
            self._apply_cached_dm_session_info(raw_messages)
            self._schedule_dm_session_info_refresh(
                client,
                [str(item.get("sessionId") or "") for item in raw_messages if isinstance(item, dict)],
                raw_messages,
            )
            normalized = [message_from_wx_private(item) for item in raw_messages if isinstance(item, dict)]
            for item in normalized:
                raw_item = item.get("raw") if isinstance(item.get("raw"), dict) else {}
                item["_sourceTab"] = normalize_text(raw_item.get("_sourceTab") or "页面响应", 64)
                item["_captureSource"] = normalize_text(raw_item.get("_captureSource") or "pre_send_poll", 64)
            try:
                self._dm_recording.observe_messages(normalized, source="pre_send_poll", tab="页面响应")
                self._dm_recording.sync_passive_observations(normalized)
            except Exception as exc:
                self._log("INFO", f"视频号私信发送前记录补充暂未完成：{type(exc).__name__}: {str(exc)[:100]}")
            for item in normalized:
                if item.get("sender") != "other" or not normalize_text(item.get("text"), 2000):
                    continue
                key = self._dm_message_key(item)
                if not key or key in existing or key in self._processed_dm_ids:
                    continue
                if normalize_text(item.get("sessionId"), 180) == session_id:
                    collected[key] = item
                else:
                    self._queue_dm_message_for_aggregate(item)
        return sorted(collected.values(), key=self._dm_message_sort_key)

    def _requeue_dm_batch_with_new_messages(self, msg: dict[str, Any], new_messages: list[dict[str, Any]]) -> int:
        session_id = normalize_text(msg.get("sessionId"), 180)
        if not session_id or not new_messages:
            return 0
        originals = msg.get("_aggregateMessages") if isinstance(msg.get("_aggregateMessages"), list) else [msg]
        by_key: dict[str, dict[str, Any]] = {}
        for item in [*originals, *new_messages]:
            if not isinstance(item, dict):
                continue
            key = self._dm_message_key(item)
            if key and key not in self._processed_dm_ids:
                by_key[key] = item
        values = sorted(by_key.values(), key=self._dm_message_sort_key)
        if len(values) <= len(originals):
            return 0
        now = int(time.monotonic() * 1000)
        self._dm_aggregate_windows[session_id] = {
            "sessionId": session_id,
            "messages": values,
            "messageKeys": set(by_key.keys()),
            "startedAt": now,
            "lastChangeAt": now,
            "releaseAt": now + 3200,
            "deadlineAt": now + 5000,
            "resetCount": 0,
            "lastLogAt": 0,
            "preSendMerged": True,
        }
        self._dm_message_event.set()
        self._log(
            "INFO",
            f"视频号私信发送前发现同联系人新消息，已取消旧草稿并重新聚合：session={session_id} total={len(values)} added={len(new_messages)}",
        )
        return len(values)

    def _run_dm_loop(self, client: WeChatVideoApiClient, runtime: WeChatVideoRuntime, generation: int) -> None:
        tabs = ["私信", "打招呼消息"]
        idx = 0
        while self._interface_loop_active(generation):
            if self._sleep_runtime_policy_if_needed():
                continue
            try:
                page_raw = self._consume_page_private_messages()
                if page_raw:
                    # Page-owned get-new-msg responses are the primary source.
                    # They are closest to the original 泡泡自动化 page.on("response") logic.
                    session_ids = list(dict.fromkeys(str(item.get("sessionId") or "") for item in page_raw if str(item.get("sessionId") or "")))
                    # 会话昵称/头像属于旁路资料，不得让约 9 秒的 get-session-info
                    # 阻塞消息聚合与回复。先使用缓存，缺失部分后台补齐。
                    self._apply_cached_dm_session_info(page_raw)
                    self._schedule_dm_session_info_refresh(client, session_ids, page_raw)
                    raw_messages = page_raw
                    tab = "页面响应"
                    source = "page_response"
                else:
                    # Do not start from an empty CgAKAA== cursor. Wait for a real
                    # page-owned get-new-msg template, then the UI-thread timer will
                    # schedule page-context fetches from that template.  In shared-runtime
                    # mode there is intentionally no second WebEngine page, so fall back
                    # to the HTTP client only when a valid CgcI... cursor already exists.
                    if self._using_external_runtime and self._has_any_valid_dm_cursor():
                        tab = tabs[idx % len(tabs)]
                        idx += 1
                        try:
                            raw_messages = client.poll_private_messages(tab)
                        except Exception as exc:
                            self._log("WARN", f"视频号私信复用会话轮询异常：{type(exc).__name__}: {str(exc)[:140]}")
                            raw_messages = []
                        source = "shared_runtime_http_poll"
                    else:
                        self.page_template_poll_requested.emit()
                        tab = "页面模板"
                        raw_messages = []
                        if self._page_poll_template:
                            source = "page_fetch_poll"
                        elif self._has_any_valid_dm_cursor():
                            source = "page_cursor_poll"
                        elif self._using_external_runtime:
                            source = "shared_runtime_wait_cursor"
                        else:
                            source = "page_template_wait"
                if not self._interface_loop_active(generation):
                    break
                normalized_messages = [message_from_wx_private(item) for item in raw_messages]
                for item in normalized_messages:
                    raw_item = item.get("raw") if isinstance(item.get("raw"), dict) else {}
                    item["_sourceTab"] = normalize_text(raw_item.get("_sourceTab") or tab, 64)
                    item["_captureSource"] = normalize_text(raw_item.get("_captureSource") or source, 64)
                try:
                    self._dm_recording.observe_messages(normalized_messages, source=source, tab=tab)
                    self._dm_recording.sync_passive_observations(normalized_messages)
                except Exception as exc:
                    self._log("WARN", f"视频号私信本地记录降级，不影响现有轮询：{type(exc).__name__}: {str(exc)[:140]}")
                messages = [m for m in normalized_messages if m.get("sender") == "other" and m.get("text")]
                self_count = len([m for m in normalized_messages if m.get("sender") == "self"])
                empty_text_count = len([m for m in normalized_messages if m.get("sender") == "other" and not m.get("text")])
                now_ms = int(time.monotonic() * 1000)
                should_log_poll = bool(raw_messages or messages or self_count or empty_text_count) or now_ms - self._last_dm_idle_poll_log_ms > 30000
                if should_log_poll:
                    self._last_dm_idle_poll_log_ms = now_ms
                    self._log(
                        "INFO",
                        f"视频号私信轮询：source={source} tab={tab} raw={len(raw_messages)} incoming={len(messages)} selfSkipped={self_count} emptySkipped={empty_text_count}"
                    )
                for msg in messages:
                    if not self._interface_loop_active(generation):
                        break
                    self._queue_dm_message_for_aggregate(msg)
                due_messages = self._pop_due_dm_aggregate_messages()
                for msg in due_messages[:5]:
                    if not self._interface_loop_active(generation):
                        break
                    outcome = self._handle_dm_message(client, runtime, msg)
                    if outcome == "sent":
                        try:
                            self.runtime_policy.record_dm_reply_sent()
                        except Exception as exc:
                            self._log("WARN", f"视频号私信发送后节奏冷却记录异常：{type(exc).__name__}: {str(exc)[:120]}")
                    self._sleep(1.0 if outcome == "sent" else 0.2)
                try:
                    # 窗口间隔只能在“本轮已真正完成”后设置。启动阶段如果还没拿到
                    # 页面真实 get-new-msg 模板/有效游标，不能把 worker 放进 15~30 分钟
                    # 长冷却；否则视频号私信 Tab 触发和游标捕获会被延后，看起来像点击失效。
                    if self._dm_can_record_window_scan(source=source, raw_messages=raw_messages, messages=messages, due_messages=due_messages):
                        self.runtime_policy.record_dm_scan(had_activity=bool(raw_messages or messages or due_messages))
                except Exception as exc:
                    self._log("WARN", f"视频号私信运行节奏记录异常：{type(exc).__name__}: {str(exc)[:120]}")
            except Exception as exc:
                self._log("WARN", f"视频号私信轮询异常：{type(exc).__name__}: {str(exc)[:180]}")
                try:
                    self.runtime_policy.record_error("dm")
                except Exception:
                    pass
                self._sleep(1.0)
            if not self._interface_loop_active(generation):
                break
            self._dm_message_event.wait(self._dm_aggregate_wait_seconds(self._dm_idle_poll_wait_sec))
            self._dm_message_event.clear()


    def _ensure_backend_dm_conversation_id(self, session_id: str, msg: dict[str, Any] | None = None) -> str:
        """按机器人 + 私信用户复用后端保存过的 Coze conversation_id。

        UCP 重启后内存里的 _conversation_ids 会清空；如果同一个用户再次私聊，
        这里先从 Core Nexus 已同步的私信会话里找最近 conversation_id，再调用
        dm/test-reply，避免把老用户当成新对话。
        """
        session_id = normalize_text(session_id, 180)
        if not session_id:
            return ""
        cached = normalize_text(self._conversation_ids.get(session_id), 180)
        if cached:
            return cached
        if not self.core_service or not hasattr(self.core_service, "list_dm_conversations"):
            return ""
        now = time.monotonic()
        miss_at = float(self._conversation_lookup_miss_at.get(session_id, 0.0) or 0.0)
        if miss_at and now - miss_at < 300.0:
            return ""

        msg = msg or {}
        candidates: list[str] = []
        for raw in (
            msg.get("nickname"),
            msg.get("fromNickname"),
            msg.get("fromUsername"),
            session_id,
        ):
            value = normalize_text(raw, 180)
            if value and value not in candidates:
                candidates.append(value)

        robot_id = normalize_text(getattr(self.account, "id", ""), 120)
        for candidate in candidates:
            try:
                data = self.core_service.list_dm_conversations(
                    robot_id=robot_id,
                    platform="wechat_video",
                    user_nickname=candidate,
                    page_size=5,
                )
            except Exception as exc:
                self._log("WARN", f"视频号私信查询历史 conversation_id 失败：{type(exc).__name__}: {str(exc)[:120]}")
                break
            conversations = data.get("conversations") if isinstance(data, dict) else []
            if not isinstance(conversations, list):
                continue
            for item in conversations:
                if not isinstance(item, dict):
                    continue
                user_name = normalize_text(item.get("user_nickname") or item.get("userNickname"), 180)
                conv_id = normalize_text(item.get("conversation_id") or item.get("conversationId"), 180)
                if not conv_id:
                    continue
                # 后端 userNickname 使用 contains 查询，这里再收紧一次，避免同名片段误命中。
                exact_or_session = (user_name == candidate) or (candidate == session_id and bool(conv_id))
                if not exact_or_session:
                    continue
                self._conversation_ids[session_id] = conv_id
                self._first_reply_done.add(session_id)
                self._log("INFO", f"视频号私信复用历史 conversation_id：session={session_id} user={user_name or candidate} conversationId={conv_id[:18]}...")
                return conv_id
        self._conversation_lookup_miss_at[session_id] = now
        return ""

    def _dm_retry_key(self, msg: dict[str, Any]) -> str:
        keys = [str(item) for item in (msg.get("_aggregateMessageKeys") or []) if str(item)]
        if not keys:
            key = self._dm_message_key(msg)
            keys = [key] if key else []
        return hashlib.sha256("\n".join(sorted(keys)).encode("utf-8", errors="ignore")).hexdigest()[:24] if keys else ""

    def _clear_dm_retry_state(self, msg: dict[str, Any]) -> None:
        retry_key = self._dm_retry_key(msg)
        if retry_key:
            self._dm_retry_attempts.pop(retry_key, None)
        for key in (msg.get("_aggregateMessageKeys") or [self._dm_message_key(msg)]):
            if key:
                self._dm_retry_exhausted_ids.discard(str(key))

    def _schedule_dm_generation_retry(self, msg: dict[str, Any], reason: str) -> tuple[bool, int, int]:
        """Requeue a generated turn after a transient backend/workflow failure."""
        retry_key = self._dm_retry_key(msg)
        if not retry_key:
            return False, 0, 0
        current = max(int(msg.get("_dmRetryCount") or 0), int(self._dm_retry_attempts.get(retry_key, 0) or 0))
        next_count = current + 1
        delays = (8, 25, 60)
        aggregate_keys = [str(item) for item in (msg.get("_aggregateMessageKeys") or []) if str(item)]
        if not aggregate_keys:
            key = self._dm_message_key(msg)
            aggregate_keys = [key] if key else []
        if next_count > len(delays):
            self._dm_retry_attempts[retry_key] = next_count
            self._dm_retry_exhausted_ids.update(aggregate_keys)
            return False, next_count, 0
        session_id = normalize_text(msg.get("sessionId"), 180)
        if not session_id:
            return False, next_count, 0
        raw_messages = msg.get("_aggregateMessages") if isinstance(msg.get("_aggregateMessages"), list) else [msg]
        retry_messages = [dict(item) for item in raw_messages if isinstance(item, dict)]
        if not retry_messages:
            retry_messages = [dict(msg)]
        retry_messages[-1]["_dmRetryCount"] = next_count
        now = int(time.monotonic() * 1000)
        delay_sec = delays[next_count - 1]
        self._dm_retry_attempts[retry_key] = next_count
        self._dm_aggregate_windows[session_id] = {
            "sessionId": session_id,
            "messages": retry_messages,
            "messageKeys": set(aggregate_keys),
            "startedAt": now,
            "lastChangeAt": now,
            "releaseAt": now + delay_sec * 1000,
            "deadlineAt": now + delay_sec * 1000,
            "resetCount": 0,
            "lastLogAt": 0,
            "retryReason": normalize_text(reason, 300),
            "retryCount": next_count,
        }
        self._dm_message_event.set()
        return True, next_count, delay_sec

    def _handle_dm_message(self, client: WeChatVideoApiClient, runtime: WeChatVideoRuntime, msg: dict[str, Any]) -> str:
        session_id = normalize_text(msg.get("sessionId"), 180)
        msg_id = normalize_text(msg.get("msgId"), 180)
        text = normalize_text(msg.get("text"), 2000)
        if not session_id or not msg_id or not text:
            return "ignored"
        key = f"{session_id}:{msg_id}"
        aggregate_keys = [str(item) for item in (msg.get("_aggregateMessageKeys") or []) if str(item)]
        if not aggregate_keys:
            aggregate_keys = [key]
        if all(item in self._processed_dm_ids for item in aggregate_keys):
            return "terminal"

        try:
            terminal, terminal_status = self._dm_recording.is_terminally_processed(msg)
        except Exception:
            terminal, terminal_status = False, ""
        if terminal:
            self._processed_dm_ids.update(aggregate_keys)
            self._log(
                "INFO",
                f"视频号私信已存在本地终态记录，跳过重复处理：session={session_id} status={terminal_status}",
            )
            return "terminal"

        aggregate_count = int(msg.get("_aggregateCount") or len(aggregate_keys) or 1)
        if aggregate_count > 1:
            self._log("INFO", f"视频号私信聚合完成：session={session_id} messageCount={aggregate_count} text={text[:80]}")

        try:
            record_ctx = self._dm_recording.begin_turn(msg)
        except Exception as exc:
            record_ctx = {}
            self._log("WARN", f"视频号私信会话记录初始化失败，已降级且不影响回复：{type(exc).__name__}: {str(exc)[:140]}")

        if record_ctx:
            self._log(
                "INFO",
                "视频号私信上下文准备完成: "
                + json.dumps({
                    "session": session_id,
                    "canonicalConversationId": normalize_text(record_ctx.get("canonical_conversation_id"), 32),
                    "identityStatus": normalize_text(record_ctx.get("identity_status"), 32),
                    "contextCount": int(record_ctx.get("context_count") or 0),
                    "currentMessageCount": len(record_ctx.get("current_client_message_ids") or []),
                }, ensure_ascii=False),
            )

        workflow_conversation_id = normalize_text(record_ctx.get("workflow_conversation_id"), 180)
        if workflow_conversation_id:
            self._conversation_ids[session_id] = workflow_conversation_id
            self._first_reply_done.add(session_id)
        else:
            existing_conversation_id = self._ensure_backend_dm_conversation_id(session_id, msg)
            if existing_conversation_id:
                self._first_reply_done.add(session_id)

        first_replies = dm_first_reply_contents(self.account)
        if first_replies and session_id not in self._first_reply_done:
            replies = first_replies
            backend = {"source": "first_reply", "replyStatus": "generated"}
            record_ctx["generation_source"] = "first_reply"
            self._first_reply_done.add(session_id)
            try:
                self._dm_recording.mark_analysis(
                    record_ctx, status="completed", draft_text="\n".join(replies), backend=backend
                )
            except Exception:
                pass
        else:
            payload = build_dm_test_payload(
                self.account,
                text,
                conversation_id=self._conversation_ids.get(session_id, ""),
                dialogue_conversation_id=normalize_text(record_ctx.get("canonical_conversation_id"), 256),
                current_client_message_ids=list(record_ctx.get("current_client_message_ids") or []),
            )
            payload.update({"platform": "wechat_video"})
            if record_ctx.get("attempt_id"):
                payload["replyAttemptId"] = normalize_text(record_ctx.get("attempt_id"), 512)
            current_ids = list(record_ctx.get("current_client_message_ids") or [])
            if current_ids:
                payload["customerMessageId"] = normalize_text(current_ids[-1], 512)
            backend = self.core_service.runtime_dm_reply(payload) if self.core_service else {}
            record_ctx["reply_trace_id"] = normalize_text(backend.get("replyTraceId"), 512)
            record_ctx["generation_source"] = normalize_text(backend.get("source") or backend.get("generationSource"), 64)
            self._log(
                "INFO",
                "视频号私信后端回复生成完成: "
                + json.dumps({
                    "session": session_id,
                    "source": normalize_text(backend.get("source"), 80),
                    "replyStatus": normalize_text(backend.get("replyStatus"), 40),
                    "replyCount": len(backend.get("replies") or []),
                    "contextCount": int(backend.get("contextMessageCount") or record_ctx.get("context_count") or 0),
                }, ensure_ascii=False),
            )
            conversation_id = normalize_text(backend.get("conversationId"), 180)
            if conversation_id:
                self._conversation_ids[session_id] = conversation_id
                try:
                    self._dm_recording.update_workflow_mapping(record_ctx, conversation_id)
                except Exception:
                    pass
            if backend.get("shouldReply") is False or backend.get("skipReply") or backend.get("replyStatus") in {"not_required", "failed"}:
                reason = normalize_text(backend.get("skipReason") or backend.get("failReason") or backend.get("judgeReason") or "后端判断无需回复", 500)
                failed = backend.get("replyStatus") == "failed"
                try:
                    self._dm_recording.mark_analysis(
                        record_ctx, status="failed" if failed else "completed", backend=backend, reason=reason
                    )
                    self._dm_recording.mark_attempt(
                        record_ctx,
                        status="send_failed" if failed else "not_required",
                        error_message=reason if failed else "",
                        confirmed=not failed,
                    )
                    self._dm_recording.post_send_sync(record_ctx)
                except Exception:
                    pass
                self._sync_dm(session_id, msg, should_reply=False, skip=not failed, reason=reason, backend=backend, replies=[], failed=failed)
                if failed:
                    scheduled, retry_no, delay_sec = self._schedule_dm_generation_retry(msg, reason)
                    if scheduled:
                        self._log("WARN", f"视频号私信回复生成失败，已保留当前消息并安排重试：session={session_id} retry={retry_no}/3 delaySec={delay_sec} reason={reason[:120]}")
                        return "retry_scheduled"
                    self._log("WARN", f"视频号私信回复生成连续失败，当前运行暂缓该消息，重启后仍可恢复：session={session_id} retry={retry_no - 1}/3 reason={reason[:120]}")
                    return "generation_failed"
                self._processed_dm_ids.update(aggregate_keys)
                self._clear_dm_retry_state(msg)
                self._log("INFO", f"视频号私信无需回复跳过：session={session_id} reason={reason[:120]}")
                return "not_required"
            replies = [normalize_text(item, 1000) for item in (backend.get("replies") or []) if normalize_text(item, 1000)]
            try:
                self._dm_recording.mark_analysis(
                    record_ctx,
                    status="completed" if replies else "empty_reply",
                    draft_text="\n".join(replies),
                    backend=backend,
                    reason="" if replies else "工作流未返回有效回复",
                )
            except Exception:
                pass

        if not replies:
            reason = "工作流未返回有效回复"
            try:
                self._dm_recording.mark_attempt(
                    record_ctx, status="send_failed", error_code="empty_reply", error_message=reason
                )
            except Exception:
                pass
            scheduled, retry_no, delay_sec = self._schedule_dm_generation_retry(msg, reason)
            if scheduled:
                self._log("WARN", f"视频号私信工作流空回复，已安排重试：session={session_id} retry={retry_no}/3 delaySec={delay_sec}")
                return "retry_scheduled"
            return "generation_failed"

        new_before_send = self._collect_pre_send_dm_messages(
            client,
            session_id,
            aggregate_keys,
        )
        if new_before_send and self._requeue_dm_batch_with_new_messages(msg, new_before_send):
            try:
                self._dm_recording.mark_attempt(
                    record_ctx,
                    status="superseded_by_new_message",
                    draft_text="\n".join(replies),
                    error_code="new_message_before_send",
                    error_message="同一联系人在回复生成期间发送了新消息，旧草稿已取消并重新生成",
                )
            except Exception:
                pass
            return "deferred_new_messages"

        sent: list[str] = []
        fail_reason = ""
        try:
            self._dm_recording.mark_attempt(record_ctx, status="send_pending", draft_text="\n".join(replies))
        except Exception:
            pass
        for reply in replies:
            result = client.send_private_message(
                session_id=session_id,
                to_username=normalize_text(msg.get("fromUsername"), 180),
                content=reply,
            )
            ok = int(result.get("errCode") or result.get("errcode") or 0) == 0
            if not ok:
                fail_reason = str(result)[:500]
                break
            sent.append(reply)
            client_message_id = normalize_text(result.get("_clientMessageId"), 180)
            try:
                self._dm_recording.persist_outgoing(
                    record_ctx, msg, content=reply, client_message_id=client_message_id
                )
            except Exception:
                pass
            self._sleep(2.0 + min(8.0, len(reply) * 0.05))

        try:
            if fail_reason:
                self._dm_recording.mark_attempt(
                    record_ctx,
                    status="send_failed",
                    draft_text="\n".join(replies),
                    actual_text="\n".join(sent),
                    error_code="platform_api_error",
                    error_message=fail_reason,
                )
            else:
                self._dm_recording.mark_attempt(
                    record_ctx,
                    status="sent",
                    draft_text="\n".join(replies),
                    actual_text="\n".join(sent),
                    confirmed=True,
                )
            self._dm_recording.post_send_sync(record_ctx)
        except Exception:
            pass

        self._sync_dm(
            session_id, msg,
            should_reply=bool(sent), skip=False, reason="", backend=backend, replies=sent,
            failed=bool(fail_reason), fail_reason=fail_reason,
        )
        self._processed_dm_ids.update(aggregate_keys)
        self._clear_dm_retry_state(msg)
        aggregate_count = int(msg.get("_aggregateCount") or len(aggregate_keys) or 1)
        confirm_mode = "platform_api_ack" if not fail_reason else "platform_api_failed"
        self._log(
            "INFO" if not fail_reason else "WARN",
            f"视频号私信发送完成：session={session_id} aggregate={aggregate_count} sent={len(sent)}/{len(replies)} confirmMode={confirm_mode}",
        )
        return "sent" if not fail_reason else "send_failed"

    def _sync_dm(self, session_id: str, msg: dict[str, Any], *, should_reply: bool, skip: bool, reason: str, backend: dict[str, Any], replies: list[str], failed: bool = False, fail_reason: str = "") -> None:
        if not self.core_service:
            return
        intent_level = normalize_text(backend.get("intentLevel") or ("none" if skip else "medium"), 32)
        turn_id = f"{session_id}:{msg.get('msgId')}"
        payload = {
            "robotId": self.account.id,
            "module": "dm",
            "platform": "wechat_video",
            "botNickname": self.account.robot_name,
            "conversations": [{
                "conversationId": self._conversation_ids.get(session_id) or session_id,
                "userNickname": normalize_text(msg.get("nickname") or msg.get("fromUsername") or session_id, 120),
                "manualTakeover": False,
                "turns": [{
                    "turnId": turn_id,
                    "sortIndex": 1,
                    "userMessage": {"content": normalize_text(msg.get("text"), 2000), "sendTime": current_time_text()},
                    "analysis": {
                        "shouldReply": bool(should_reply),
                        "skipReply": bool(skip),
                        "skipReason": reason if skip else "",
                        "messageType": normalize_text(backend.get("messageType") or "wechat_video_dm", 80),
                        "intentLevel": intent_level,
                        "intentLabel": intent_label(intent_level),
                        "judgeReason": normalize_text(backend.get("judgeReason") or reason, 800),
                    },
                    "reply": {
                        "replyStatus": "failed" if failed else "not_required" if skip else "sent",
                        "replies": [] if skip else replies,
                        "replyCount": 0 if skip else len(replies),
                        "replyTime": "" if skip or failed else current_time_text(),
                        "failReason": fail_reason or (reason if failed else ""),
                    },
                }],
            }],
        }
        try:
            self.core_service.sync_dm_conversations(payload)
        except Exception as exc:
            self._log("WARN", f"视频号私信同步后端失败：{type(exc).__name__}: {str(exc)[:160]}")
