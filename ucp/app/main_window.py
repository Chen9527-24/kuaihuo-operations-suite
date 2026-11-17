from __future__ import annotations

from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import hashlib
import re
import time
from pathlib import Path
from typing import Any

import requests

from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QSplitter,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from app.models import Account, UserSession
from app.platforms.douyin.session_controller import SessionController
from app.platforms.wechat_video.session_controller import WeChatVideoSessionController
from app.services.app_config import AppConfig
from app.services.auto_reply_runtime import auto_reply_config_summary, merge_auto_reply_setting_into_account
from app.services.core_nexus_service import CoreNexusService
from app.services.logger_bus import LoggerBus
from app.services.local_records import LocalRecordService, NullLocalRecordService
from app.services.runtime_policy import normalize_runtime_policy
from app.styles import APP_QSS
from app.widgets.account_list import AccountListPanel
from app.widgets.log_dialog import LogDialog
from app.widgets.login_page import LoginPage
from app.widgets.tenant_select_page import TenantSelectPage
from app.widgets.top_bar import TopBar


BACKEND_STOP_REQUEST_STATUSES = {"STOPPING", "STOPPED", "DISABLED", "EXPIRED", "ERROR"}
GUI_LOG_MAX_LINES = 600
GUI_LOG_APPEND_BATCH = 120
GUI_REQUEST_MAX_ROWS = 50
ANOMALY_REPORT_COOLDOWN_SEC = 300


class MainWindow(QMainWindow):
    def __init__(self, project_root: Path) -> None:
        super().__init__()
        self.project_root = project_root
        self.profile_root = project_root / "profiles"
        self.profile_root.mkdir(exist_ok=True, parents=True)

        self.app_config = AppConfig(project_root)
        self.logger_bus = LoggerBus()
        self.logger_bus.log_emitted.connect(self.on_log)
        self.core_service = CoreNexusService(api_base_url=self.app_config.api_base_url(), request_logger=self.on_request)

        self.controllers: dict[str, object] = {}
        self.accounts: list[Account] = []
        # account_map is the currently visible robot list after platform/type filtering.
        # known_account_map keeps every robot identity seen in this GUI session so
        # background logs from running robots remain routeable even after the user
        # switches between 私信/评论 tabs.
        self.account_map: dict[str, Account] = {}
        self.known_account_map: dict[str, Account] = {}
        self.current_platform = "DOUYIN"
        self.current_robot_type = "PRIVATE_MESSAGE"
        # 私信/评论 Tab 是平台内状态，不能作为全局状态复用。
        # 例如：抖音切到评论后，再切到视频号，视频号仍应保持自己上次的私信/评论选择。
        self.platform_robot_type_map: dict[str, str] = {
            "DOUYIN": "PRIVATE_MESSAGE",
            "KUAISHOU": "PRIVATE_MESSAGE",
            "XIAOHONGSHU": "PRIVATE_MESSAGE",
            "WECHAT_VIDEO": "PRIVATE_MESSAGE",
        }
        self.selected_account_by_scope: dict[str, str] = {}
        self.current_account_id: str | None = None
        self.session: UserSession | None = None
        # 记录最近一次授权状态回写，按状态迁移去重而不是按账号永久去重。
        # 这样既能避免高频请求，也允许 WAIT_QR -> AUTHORIZED -> WAIT_QR 的真实降级。
        self.last_auth_sync_state: dict[str, dict[str, Any]] = {}
        self.expiry_notified: set[str] = set()
        self.monitor_busy = False
        self._shutdown_done = False

        self.log_buffer: deque[str] = deque(maxlen=GUI_LOG_MAX_LINES)
        self.request_buffer: deque[dict[str, Any]] = deque(maxlen=GUI_REQUEST_MAX_ROWS)
        # 全局日志只用于“总日志中心”；机器人日志必须按 robot_id 单独缓存。
        # 同名私信/评论机器人只允许复用登录态，不允许复用日志、状态、页面或请求视图。
        self.robot_log_buffers: dict[str, deque[str]] = {}
        self.robot_request_buffers: dict[str, deque[dict[str, Any]]] = {}
        self.log_pending_lines: list[str] = []
        self.request_pending_entries: list[dict[str, Any]] = []
        self.log_pending_by_robot: dict[str, list[str]] = {}
        self.request_pending_by_robot: dict[str, list[dict[str, Any]]] = {}
        self.log_dialog_snapshot_loaded = False
        self.request_dialog_snapshot_loaded = False
        self.log_dialog_robot_filter_id: str | None = None
        self.log_flush_timer = QTimer(self)
        self.log_flush_timer.setInterval(160)
        self.log_flush_timer.timeout.connect(self._flush_dialog_buffers)
        self.log_flush_timer.start()

        self.log_compact_timer = QTimer(self)
        self.log_compact_timer.setInterval(30 * 60 * 1000)
        self.log_compact_timer.timeout.connect(self._compact_gui_log_buffers)
        self.log_compact_timer.start()

        self._anomaly_report_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ucp-anomaly")
        self._anomaly_reported_at: dict[str, float] = {}

        self.robot_monitor_timer = QTimer(self)
        self.robot_monitor_timer.setInterval(30000)
        self.robot_monitor_timer.timeout.connect(self._monitor_running_robots)
        self.robot_monitor_timer.start()

        try:
            self.local_record_service = LocalRecordService(
                self.project_root,
                log=lambda level, message: self.logger_bus.emit("LOCAL_RECORDS", level, message),
            )
        except Exception as exc:
            self.local_record_service = NullLocalRecordService()
            self.logger_bus.emit(
                "LOCAL_RECORDS",
                "WARN",
                f"本地对话记录底座启动失败，已自动降级且不影响原机器人功能：{type(exc).__name__}: {str(exc)[:240]}",
            )

        self.setWindowTitle("UCP 自动化控制台")
        self.resize(1560, 960)
        self.setStyleSheet(APP_QSS)

        self.log_dialog = LogDialog(self)

        self._build_ui()
        self._build_menu()
        if not self._try_restore_gui_session():
            self._goto_login()
            self.on_log("system", "INFO", "应用已启动，等待登录。")

    def _build_menu(self) -> None:
        help_menu = self.menuBar().addMenu("帮助")
        about_action = help_menu.addAction("关于")
        about_action.triggered.connect(
            lambda: QMessageBox.information(
                self,
                "关于",
                "UCP 自动化控制台\n用于对接 Core Nexus 的桌面管理界面。",
            )
        )

    def _build_ui(self) -> None:
        self.page_stack = QStackedWidget()
        self.setCentralWidget(self.page_stack)

        self.login_page = LoginPage()
        cache = self.app_config.load_login_cache()
        self.login_page.set_saved_credentials(cache.username, cache.password, cache.remember)
        self.login_page.login_requested.connect(self._handle_login)
        self.page_stack.addWidget(self.login_page)

        self.tenant_page = TenantSelectPage()
        self.tenant_page.tenant_confirmed.connect(self._complete_tenant_selection)
        self.tenant_page.back_requested.connect(self._goto_login)
        self.page_stack.addWidget(self.tenant_page)

        self.workspace_page = QWidget()
        self.page_stack.addWidget(self.workspace_page)

        root = QVBoxLayout(self.workspace_page)
        root.setContentsMargins(12, 12, 12, 12)
        root.setSpacing(12)

        self.top_bar = TopBar()
        self.top_bar.platform_changed.connect(self._switch_platform)
        self.top_bar.logout_clicked.connect(self._logout_gui_session)
        root.addWidget(self.top_bar)

        content_splitter = QSplitter(Qt.Orientation.Horizontal)
        root.addWidget(content_splitter, 1)

        self.account_panel = AccountListPanel()
        self.account_panel.account_selected.connect(self._select_account)
        self.account_panel.refresh_requested.connect(self._load_accounts)
        self.account_panel.robot_type_changed.connect(self._switch_robot_type)
        self.account_panel.start_requested.connect(self._start_robot)
        self.account_panel.stop_requested.connect(self._stop_robot)
        self.account_panel.log_requested.connect(self._show_robot_log_dialog)
        content_splitter.addWidget(self.account_panel)

        right = QFrame()
        right.setObjectName("RightPanel")
        right_layout = QVBoxLayout(right)
        right_layout.setContentsMargins(14, 14, 14, 14)
        right_layout.setSpacing(12)
        content_splitter.addWidget(right)
        content_splitter.setStretchFactor(1, 1)
        content_splitter.setSizes([360, 1240])

        self.preview_canvas = QFrame()
        self.preview_canvas.setObjectName("PreviewCanvas")
        canvas_layout = QVBoxLayout(self.preview_canvas)
        canvas_layout.setContentsMargins(0, 0, 0, 0)
        canvas_layout.setSpacing(0)

        self.preview_stack = QStackedWidget()
        self.placeholder = QLabel(
            "请选择左侧机器人卡片，右侧将展示对应的网页模块。\n\n"
            "启动按钮已放置在左侧卡片内；抖音模块会打开网页预览，视频号模块使用接口化运行。\n"
            "接口请求与运行日志可通过机器人名称旁边的日志图标打开查看。"
        )
        self.placeholder.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.placeholder.setObjectName("PreviewPlaceholder")
        self.preview_stack.addWidget(self.placeholder)
        canvas_layout.addWidget(self.preview_stack)
        right_layout.addWidget(self.preview_canvas, 1)

    def _goto_login(self) -> None:
        self.page_stack.setCurrentWidget(self.login_page)
        self.login_page.set_loading(False)
        self.current_account_id = None
        self.session = None
        self.top_bar.page_title.setText("未登录")

    def _goto_workspace(self) -> None:
        self.page_stack.setCurrentWidget(self.workspace_page)

    def _save_gui_session_cache(self, session: UserSession | None = None) -> None:
        session = session or self.session
        if not session or not session.refresh_token:
            return
        self.app_config.save_gui_session_cache(
            access_token=session.access_token,
            refresh_token=session.refresh_token,
            username=session.username,
            display_name=session.display_name,
            user_id=session.user_id,
            tenant_id=session.tenant_id,
            tenant_name=session.tenant_name,
        )

    def _try_restore_gui_session(self) -> bool:
        cache = self.app_config.load_gui_session_cache()
        if not cache.refresh_token:
            return False
        try:
            self.core_service.set_base_url(self.app_config.api_base_url())
            session = self.core_service.refresh_session(cache.refresh_token)
            self.session = session
            tenant_ids = {item.tenant_id for item in session.tenants if item.tenant_id}
            cached_tenant_id = cache.tenant_id if cache.tenant_id and (not tenant_ids or cache.tenant_id in tenant_ids) else ""
            if cached_tenant_id:
                self._complete_tenant_selection(cached_tenant_id, auto_restored=True)
                self.on_log("auth", "INFO", f"已恢复 GUI 登录状态并沿用上次租户：{session.display_name or session.username}")
                return True
            if len(session.tenants) > 1:
                self.tenant_page.set_tenants(session.tenants)
                self.page_stack.setCurrentWidget(self.tenant_page)
                self.on_log("auth", "INFO", f"已恢复 GUI 登录状态：{session.display_name or session.username}，等待选择租户")
                return True
            tenant_id = session.tenant_id or (session.tenants[0].tenant_id if session.tenants else "")
            if tenant_id:
                self._complete_tenant_selection(tenant_id, auto_restored=True)
            else:
                self._goto_login()
                return False
            self.on_log("auth", "INFO", f"已恢复 GUI 登录状态：{session.display_name or session.username}")
            return True
        except Exception as exc:
            self.app_config.clear_gui_session_cache()
            self.on_log("auth", "WARN", f"恢复 GUI 登录状态失败，已回到登录页：{exc}")
            return False

    def _logout_gui_session(self) -> None:
        answer = QMessageBox.question(
            self,
            "退出 GUI 登录",
            "确认退出当前 GUI 登录并清理本地登录状态吗？\n\n平台账号的浏览器授权状态不会被清理。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        if answer != QMessageBox.StandardButton.Yes:
            return
        try:
            cache = self.app_config.load_gui_session_cache()
            self.core_service.logout(cache.refresh_token or None)
        except Exception:
            pass
        self.app_config.clear_gui_session_cache()
        self._release_current_preview()
        for controller in list(self.controllers.values()):
            try:
                if controller.is_running():
                    controller.stop()
            except Exception:
                pass
        self.controllers.clear()
        self.accounts = []
        self.account_map = {}
        self.account_panel.set_accounts([])
        self.preview_stack.setCurrentWidget(self.placeholder)
        self.on_log("auth", "INFO", "已退出 GUI 登录并清理本地登录状态。")
        self._goto_login()

    def _handle_login(self, username: str, password: str, remember: bool) -> None:
        if not username or not password:
            QMessageBox.warning(self, "提示", "请填写账号和密码。")
            return
        self.login_page.set_loading(True)
        try:
            self.core_service.set_base_url(self.app_config.api_base_url())
            session = self.core_service.login(username, password)
            self.app_config.save_login_cache(username, password, remember)
            self.session = session
            self._save_gui_session_cache(session)
            self.on_log("auth", "INFO", f"登录成功：{session.display_name or session.username}")

            # 手动账号密码登录视为一次新的进入，需要用户显式选择租户；
            # 只有下次恢复本地 GUI 登录态时，才沿用上次已选择的租户直接进入。
            if len(session.tenants) > 1:
                self.tenant_page.set_tenants(session.tenants)
                self.page_stack.setCurrentWidget(self.tenant_page)
                return

            tenant_id = session.tenant_id or (session.tenants[0].tenant_id if session.tenants else "")
            if not tenant_id:
                raise RuntimeError("当前账号未获取到可用租户。")
            self._complete_tenant_selection(tenant_id)
        except Exception as exc:
            QMessageBox.critical(self, "登录失败", str(exc))
            self.on_log("auth", "ERROR", f"登录失败：{exc}")
        finally:
            self.login_page.set_loading(False)

    def _complete_tenant_selection(self, tenant_id: str, auto_restored: bool = False) -> None:
        tenant_id = str(tenant_id or "").strip()
        if not tenant_id:
            QMessageBox.warning(self, "请选择租户", "租户为必选项，请先选择一个工作空间。")
            return
        try:
            session = self.core_service.switch_tenant(tenant_id)
            self.session = session
            self._save_gui_session_cache(session)
            self.top_bar.set_session_info(
                username=session.display_name or session.username,
                tenant_name=session.tenant_name or tenant_id,
            )
            self.current_robot_type = self.platform_robot_type_map.get(self.current_platform, "PRIVATE_MESSAGE")
            self.top_bar.set_platform(self.current_platform)
            self.account_panel.set_robot_type(self.current_robot_type)
            self.top_bar.page_title.setText("机器人工作台")
            self.top_bar.set_runtime_hint("右上角可查看运行日志与接口请求记录")
            self._goto_workspace()
            self._load_accounts()
            self.on_log("auth", "INFO", f"租户切换完成：{session.tenant_name or tenant_id}")
        except Exception as exc:
            QMessageBox.critical(self, "租户切换失败", str(exc))
            self.on_log("auth", "ERROR", f"租户切换失败：{exc}")

    def _scope_key(self, platform: str | None = None, robot_type: str | None = None) -> str:
        return f"{platform or self.current_platform}:{robot_type or self.current_robot_type}"

    def _remember_current_scope_selection(self) -> None:
        if self.current_account_id:
            self.selected_account_by_scope[self._scope_key()] = self.current_account_id
        if self.current_platform:
            self.platform_robot_type_map[self.current_platform] = self.current_robot_type

    def _switch_platform(self, platform: str) -> None:
        platform = str(platform or "").strip() or "DOUYIN"
        if platform == self.current_platform:
            self.top_bar.set_platform(platform)
            self.account_panel.set_robot_type(self.current_robot_type)
            return
        self._remember_current_scope_selection()
        self._release_current_preview()
        self.current_platform = platform
        self.current_robot_type = self.platform_robot_type_map.get(platform, "PRIVATE_MESSAGE")
        self.top_bar.set_platform(platform)
        self.account_panel.set_robot_type(self.current_robot_type)
        self._load_accounts()
        self.on_log("system", "INFO", f"切换平台 -> {platform}，机器人分类保持为该平台独立状态：{self.current_robot_type}")

    def _switch_robot_type(self, robot_type: str) -> None:
        robot_type = str(robot_type or "").strip() or "PRIVATE_MESSAGE"
        if robot_type not in {"PRIVATE_MESSAGE", "COMMENT_REPLY"}:
            robot_type = "PRIVATE_MESSAGE"
        if robot_type == self.current_robot_type:
            self.platform_robot_type_map[self.current_platform] = robot_type
            self.account_panel.set_robot_type(robot_type)
            return
        self._remember_current_scope_selection()
        self._release_current_preview()
        self.current_robot_type = robot_type
        self.platform_robot_type_map[self.current_platform] = robot_type
        self.account_panel.set_robot_type(robot_type)
        self._load_accounts()
        self.on_log("system", "INFO", f"切换机器人分类 -> {robot_type}（仅影响当前平台 {self.current_platform}）")

    def _load_accounts(self) -> None:
        if not self.session:
            return
        try:
            previous_id = self.selected_account_by_scope.get(self._scope_key())
            accounts = self.core_service.list_robots(
                platform=self.current_platform,
                robot_type=self.current_robot_type,
            )
            previous_status: dict[str, str] = {}
            for robot_id, controller in self.controllers.items():
                try:
                    if hasattr(controller, "current_state"):
                        previous_status[robot_id] = str(controller.current_state())
                    elif hasattr(controller, "is_running") and controller.is_running():
                        previous_status[robot_id] = "运行中"
                except Exception as exc:
                    self.on_log("robot", "WARN", f"读取本地控制器状态失败，已忽略：{robot_id}，{type(exc).__name__}: {str(exc)[:120]}")
            for acc in accounts:
                if acc.id in previous_status:
                    acc.runtime_status = previous_status[acc.id]
            self.accounts = accounts
            self.account_map = {acc.id: acc for acc in accounts}
            self._remember_accounts(accounts)
            self._register_local_record_accounts(accounts)
            self.account_panel.set_accounts(accounts)
            if not accounts:
                self.current_account_id = None
                self.selected_account_by_scope.pop(self._scope_key(), None)
                self.top_bar.page_title.setText("机器人工作台")
                self.preview_stack.setCurrentWidget(self.placeholder)
                self.on_log("robot", "INFO", "当前筛选条件下暂无机器人数据。")
                return

            target_id = previous_id if previous_id in self.account_map else accounts[0].id
            self.selected_account_by_scope[self._scope_key()] = target_id
            self.account_panel.set_selected_account(target_id)
            self._select_account(target_id)
            self.on_log(
                "robot",
                "INFO",
                f"已加载机器人 {len(accounts)} 个，平台={self.current_platform}，分类={self.current_robot_type}",
            )
        except Exception as exc:
            QMessageBox.critical(self, "加载失败", f"获取机器人列表失败：{exc}")
            self.on_log("robot", "ERROR", f"获取机器人列表失败：{exc}")

    def _select_account(self, account_id: str) -> None:
        if account_id not in self.account_map:
            return
        same_account = self.current_account_id == account_id
        if not same_account:
            self._release_current_preview()
        self.current_account_id = account_id
        self.selected_account_by_scope[self._scope_key()] = account_id
        acc = self.account_map[account_id]
        self.top_bar.page_title.setText(f"{acc.robot_type_label}机器人 · {acc.name}")
        controller = self.controllers.get(acc.id)
        if controller and controller.is_running():
            controller.open_preview()
            preview = controller.preview_widget()
            index = self.preview_stack.indexOf(preview)
            if index == -1:
                self.preview_stack.addWidget(preview)
            self.preview_stack.setCurrentWidget(preview)
            self.top_bar.set_runtime_hint("当前机器人已运行，右侧显示对应网页模块")
        else:
            self.preview_stack.setCurrentWidget(self.placeholder)
            self.top_bar.set_runtime_hint("当前机器人未启动；请使用左侧卡片中的按钮进行启动")

    def _hydrate_robot_auto_reply_config(self, acc: Account, module: str) -> Account:
        """Load latest robot detail and auto-reply setting before local GUI starts."""
        current_status = acc.runtime_status
        try:
            fresh = self.core_service.get_robot(acc.id)
            if fresh and fresh.id:
                fresh.runtime_status = current_status
                acc = fresh
        except Exception as exc:
            self.on_log("robot", "WARN", f"获取机器人详情失败，继续使用列表数据：{acc.name}，{type(exc).__name__}: {str(exc)[:160]}")

        try:
            setting = self.core_service.get_robot_auto_reply_setting(acc.id, module)
            if isinstance(setting, dict) and setting:
                merge_auto_reply_setting_into_account(acc, module, setting)
        except Exception as exc:
            self.on_log("robot", "WARN", f"获取自动回复配置失败，继续使用机器人 config：{acc.name}，module={module}，{type(exc).__name__}: {str(exc)[:160]}")

        summary = auto_reply_config_summary(acc, module)
        self.on_log("robot", "INFO", f"自动回复配置加载摘要: {summary}")
        self.account_map[acc.id] = acc
        self.known_account_map[acc.id] = acc
        self.local_record_service.register_account(acc)
        self.accounts = [acc if item.id == acc.id else item for item in self.accounts]
        self.account_panel.update_card(acc)
        return acc

    def _get_or_create_controller(self, acc: Account):
        if acc.platform not in {"DOUYIN", "WECHAT_VIDEO"}:
            raise ValueError("当前仅实现抖音和微信视频号控制器")
        self.known_account_map[acc.id] = acc
        if acc.id in self.controllers:
            controller = self.controllers[acc.id]
            controller.account = acc
            controller.record_service = self.local_record_service
            return controller
        if acc.platform == "WECHAT_VIDEO":
            controller = WeChatVideoSessionController(
                acc,
                self.profile_root,
                self.logger_bus,
                core_service=self.core_service,
                request_logger=self.on_request,
                record_service=self.local_record_service,
            )
        else:
            controller = SessionController(
                acc,
                self.profile_root,
                self.logger_bus,
                core_service=self.core_service,
                record_service=self.local_record_service,
            )
        controller.state_changed.connect(self._on_account_state_changed)
        controller.title_changed.connect(self._on_account_title_changed)
        controller.auth_confirmed.connect(self._on_controller_auth_confirmed)
        self.controllers[acc.id] = controller
        return controller

    def _start_robot(self, robot_id: str) -> None:
        acc = self.account_map.get(robot_id)
        if not acc:
            return
        self.current_account_id = robot_id
        self.account_panel.set_selected_account(robot_id)
        if acc.is_expired() or acc.backend_status == "EXPIRED":
            QMessageBox.warning(self, "提示", f"机器人“{acc.name}”已过期，无法启动。")
            return
        if not acc.can_start:
            QMessageBox.warning(self, "提示", f"机器人“{acc.name}”当前状态不允许启动。")
            return

        try:
            self.last_auth_sync_state.pop(robot_id, None)
            module = "dm" if acc.robot_type == "PRIVATE_MESSAGE" else "comment"
            acc = self._hydrate_robot_auto_reply_config(acc, module)
            controller = self._get_or_create_controller(acc)
            controller.account = acc
            controller.start(module)
            controller.open_preview()
            preview = controller.preview_widget()
            index = self.preview_stack.indexOf(preview)
            if index == -1:
                self.preview_stack.addWidget(preview)
            self.preview_stack.setCurrentWidget(preview)
            acc.runtime_status = "启动中"
            self.account_panel.update_card(acc)
            # 启动只表示本地 WebView 开始验证页面状态，不再抢先写 WAIT_QR。
            # 只有 controller 明确进入“待扫码”时才同步 WAIT_QR；明确进入目标模块/运行中时才同步 AUTHORIZED。
            self._sync_robot_runtime_status(acc, "RUNNING", note="本地启动后同步运行状态")
            self.on_log("robot", "INFO", f"已在 GUI 本地启动机器人：{acc.name}（{acc.robot_type_label}，{acc.id}），模块={module}，未调用后端启动接口。")
        except Exception as exc:
            self._sync_robot_runtime_status(acc, "ERROR", last_error=str(exc), note="本地启动异常")
            QMessageBox.critical(self, "启动失败", str(exc))
            self.on_log("robot", "ERROR", f"启动机器人失败：{exc}")

    def _stop_robot(self, robot_id: str) -> None:
        acc = self.account_map.get(robot_id)
        if not acc:
            return
        self.current_account_id = robot_id
        self.account_panel.set_selected_account(robot_id)
        if not acc.can_stop:
            self.on_log("robot", "INFO", f"忽略停止请求：{acc.name} 当前状态无需停止。")
            return
        try:
            controller = self._get_or_create_controller(acc)
            controller.stop()
            acc.runtime_status = "已停止"
            self.account_panel.update_card(acc)
            self._sync_robot_runtime_status(acc, "STOPPED", stop_reason="MANUAL", note="本地停止后同步运行状态")
            if self.current_account_id == robot_id:
                self.preview_stack.setCurrentWidget(self.placeholder)
                self.top_bar.set_runtime_hint("当前机器人已停止")
            self.on_log("robot", "INFO", f"已在 GUI 本地停止机器人：{acc.name}（{acc.robot_type_label}，{acc.id}），未调用后端停止接口。")
        except Exception as exc:
            QMessageBox.critical(self, "停止失败", str(exc))
            self.on_log("robot", "ERROR", f"停止机器人失败：{exc}")

    def _logout_platform_account(self, robot_id: str) -> None:
        acc = self.account_map.get(robot_id)
        if not acc:
            return
        self.current_account_id = robot_id
        self.account_panel.set_selected_account(robot_id)
        display = acc.bound_account_display
        answer = QMessageBox.question(
            self,
            "退出平台登录",
            f"确认清理“{display}”的本地浏览器登录状态吗？\n\n清理后下次启动该绑定账号需要重新扫码/登录；不会调用后端撤销接口。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        if answer != QMessageBox.StandardButton.Yes:
            return
        try:
            controller = self._get_or_create_controller(acc)
            controller.logout_platform_account()
            acc.runtime_status = "已停止"
            acc.auth_status = "AUTH_EXPIRED"
            self.last_auth_sync_state.pop(robot_id, None)
            self.account_panel.update_card(acc)
            if self.current_account_id == robot_id:
                self.preview_stack.setCurrentWidget(self.placeholder)
                self.top_bar.set_runtime_hint("已清理本地浏览器登录状态；下次启动需重新授权")
            self.on_log("auth", "INFO", f"已退出本地平台登录并清理浏览器状态：{acc.name} / {display}，未调用后端撤销接口。")
        except Exception as exc:
            QMessageBox.critical(self, "退出登录失败", str(exc))
            self.on_log("auth", "ERROR", f"退出平台登录失败：{exc}")

    def _merge_account(self, fresh: Account) -> None:
        existing = self.account_map.get(fresh.id)
        if not existing:
            return
        existing.backend_status = fresh.backend_status or existing.backend_status
        existing.auth_status = fresh.auth_status or existing.auth_status
        existing.auth_name = fresh.auth_name or existing.auth_name
        existing.auth_uid = fresh.auth_uid or existing.auth_uid
        existing.device_status = fresh.device_status or existing.device_status
        existing.device_name = fresh.device_name or existing.device_name
        existing.device_code = fresh.device_code or existing.device_code
        existing.device_id = fresh.device_id or existing.device_id
        existing.auth_id = fresh.auth_id or existing.auth_id
        existing.remark = fresh.remark or existing.remark
        existing.expire_at = fresh.expire_at or existing.expire_at
        self.local_record_service.register_account(existing)
        self.account_panel.update_card(existing)

    def _on_account_state_changed(self, account_id: str, state: str) -> None:
        acc = self.account_map.get(account_id)
        if acc:
            acc.runtime_status = state
            self.account_panel.update_card(acc)
        if self.current_account_id == account_id:
            controller = self.controllers.get(account_id)
            if controller and controller.is_running():
                controller.open_preview()
                preview = controller.preview_widget()
                index = self.preview_stack.indexOf(preview)
                if index == -1:
                    self.preview_stack.addWidget(preview)
                self.preview_stack.setCurrentWidget(preview)
            else:
                self.preview_stack.setCurrentWidget(self.placeholder)
        if acc and state == "待扫码":
            self._sync_auth_waiting(acc)
        if acc and state == "运行中":
            self._sync_auth_authorized(acc)
            self._sync_robot_runtime_status(acc, "RUNNING", note="本地页面进入运行中后同步状态")
        if acc and state == "已停止":
            self._sync_robot_runtime_status(acc, "STOPPED", stop_reason="MANUAL", note="本地会话停止后同步状态")
        if acc and state == "错误":
            self._sync_robot_runtime_status(acc, "ERROR", last_error="本地控制器运行异常", note="本地控制器异常后同步状态")

    def _on_controller_auth_confirmed(self, account_id: str, payload: dict) -> None:
        acc = self.account_map.get(account_id)
        if not acc:
            return
        self.on_log("auth", "INFO", f"扫码授权已确认：{acc.name}（{acc.robot_type_label}，{acc.id}），授权摘要={payload}")
        self._sync_auth_authorized(acc, session_summary=payload)
        self._sync_robot_runtime_status(acc, "RUNNING", note="扫码授权确认后同步运行状态")

    def _on_account_title_changed(self, account_id: str, title: str) -> None:
        if self.current_account_id == account_id and title:
            acc = self.account_map.get(account_id)
            if acc:
                self.top_bar.page_title.setText(f"{acc.name} · {title}")

    def _sync_robot_runtime_status(
        self,
        acc: Account,
        status: str,
        *,
        stop_reason: str | None = None,
        last_error: str | None = None,
        note: str = "",
    ) -> None:
        try:
            fresh = self.core_service.update_robot_runtime_status(
                acc.id,
                status,
                stop_reason=stop_reason,
                last_error=last_error,
            )
            if fresh:
                self._merge_account(fresh)
            if note:
                self.on_log("robot", "INFO", f"{note}: {acc.name}（{acc.robot_type_label}，{acc.id}） -> {status}")
        except Exception as exc:
            self.on_log("robot", "WARN", f"同步机器人运行状态失败：{acc.name}（{acc.robot_type_label}，{acc.id}） -> {status}；{exc}")

    def _should_sync_auth_status(self, acc: Account, status: str, *, reason: str, min_interval_sec: int = 12) -> bool:
        now = time.monotonic()
        last = self.last_auth_sync_state.get(acc.id)
        if not last:
            self.last_auth_sync_state[acc.id] = {"status": status, "reason": reason, "at": now}
            return True
        if last.get("status") != status:
            self.last_auth_sync_state[acc.id] = {"status": status, "reason": reason, "at": now}
            return True
        if last.get("reason") != reason and now - float(last.get("at", 0)) >= min_interval_sec:
            self.last_auth_sync_state[acc.id] = {"status": status, "reason": reason, "at": now}
            return True
        if now - float(last.get("at", 0)) >= max(min_interval_sec * 5, 60):
            self.last_auth_sync_state[acc.id] = {"status": status, "reason": reason, "at": now}
            return True
        return False

    def _sync_auth_waiting(self, acc: Account) -> None:
        # 只有页面真实进入登录/扫码等待态时才写 WAIT_QR；启动阶段不再抢先降级。
        if not self._should_sync_auth_status(acc, "WAIT_QR", reason="controller_login_wait"):
            return
        try:
            self.core_service.touch_device_online(acc.device_id)
            fresh = self.core_service.sync_robot_auth_status(
                acc.id,
                "WAIT_QR",
                device_id=acc.device_id or None,
                account_name=acc.auth_name or acc.name or None,
                account_uid=acc.auth_uid or None,
                source="GUI_PAGE_STATE",
                reason="login_wait",
                clear_session=True,
                remark="UCP 检测到页面进入扫码/登录等待态后回写。",
            )
            if fresh:
                self._merge_account(fresh)
            auth_note = "自动创建/绑定授权记录" if not acc.auth_id else "更新既有授权记录"
            self.on_log("auth", "INFO", f"已按页面真实状态同步授权为待扫码：{acc.name}（{acc.robot_type_label}，{acc.id}，{auth_note}）")
        except Exception as exc:
            if acc.auth_id:
                try:
                    self.core_service.sync_auth_waiting(acc.auth_id, device_id=acc.device_id or None)
                    self.on_log("auth", "INFO", f"已通过兼容接口同步授权状态为待扫码：{acc.name}（{acc.robot_type_label}，{acc.id}）")
                    return
                except Exception as legacy_exc:
                    self.on_log("auth", "WARN", f"兼容接口同步待扫码状态失败：{legacy_exc}")
            self.on_log("auth", "WARN", f"同步待扫码状态失败：{exc}")

    def _sync_auth_authorized(self, acc: Account, session_summary: dict | None = None) -> None:
        if not self._should_sync_auth_status(acc, "AUTHORIZED", reason="controller_module_ready"):
            return
        try:
            self.core_service.touch_device_online(acc.device_id)
            fresh = self.core_service.sync_robot_auth_status(
                acc.id,
                "AUTHORIZED",
                device_id=acc.device_id or None,
                account_name=acc.auth_name or acc.name or None,
                account_uid=acc.auth_uid or None,
                account_avatar_url=acc.auth_avatar_url or None,
                session_data=str(session_summary) if session_summary else None,
                authorized_at=datetime.utcnow().isoformat() + "Z",
                source="GUI_PAGE_STATE",
                reason="module_ready",
                clear_session=False,
                remark="UCP 检测到目标模块已就绪/扫码授权确认后回写。",
            )
            if fresh:
                self._merge_account(fresh)
            auth_note = "自动创建/绑定授权记录" if not acc.auth_id else "更新既有授权记录"
            self.on_log("auth", "INFO", f"已按页面真实状态同步授权为已授权：{acc.name}（{acc.robot_type_label}，{acc.id}，{auth_note}）")
        except Exception as exc:
            if acc.auth_id:
                try:
                    self.core_service.sync_auth_authorized(
                        acc.auth_id,
                        device_id=acc.device_id or None,
                        account_name=acc.auth_name or None,
                        account_uid=acc.auth_uid or None,
                        session_data=str(session_summary) if session_summary else None,
                        remark="UCP 检测到目标模块已就绪/扫码授权确认后回写。",
                    )
                    self.on_log("auth", "INFO", f"已通过兼容接口同步扫码授权结果：{acc.name}（{acc.robot_type_label}，{acc.id}）")
                    return
                except Exception as legacy_exc:
                    self.on_log("auth", "WARN", f"兼容接口同步授权结果失败：{legacy_exc}")
            self.on_log("auth", "WARN", f"同步授权结果失败：{exc}")

    def _monitor_running_robots(self) -> None:
        if self.monitor_busy or not self.session:
            return
        running_ids = [robot_id for robot_id, controller in self.controllers.items() if controller.is_running()]
        if not running_ids:
            return
        self.monitor_busy = True
        try:
            for robot_id in running_ids:
                controller = self.controllers.get(robot_id)
                if not controller or not controller.is_running():
                    continue
                try:
                    fresh = self.core_service.get_robot(robot_id)
                except Exception as exc:
                    self.on_log("robot", "WARN", f"后台检测机器人状态失败 {robot_id}: {exc}")
                    continue
                existing = self.account_map.get(robot_id)
                if existing:
                    self._merge_account(fresh)
                target = existing or fresh
                if fresh.backend_status in BACKEND_STOP_REQUEST_STATUSES or fresh.is_expired():
                    self._expire_or_stop_robot(target, reason=fresh.backend_status_label, backend_status=fresh.backend_status)
        finally:
            self.monitor_busy = False

    def _expire_or_stop_robot(self, acc: Account, *, reason: str, backend_status: str | None = None) -> None:
        controller = self.controllers.get(acc.id)
        if controller and controller.is_running():
            controller.stop()
        acc.runtime_status = "已停止"

        target_status = backend_status or acc.backend_status or "EXPIRED"
        if acc.is_expired():
            target_status = "EXPIRED"
        if target_status == "STOPPING":
            sync_status = "STOPPED"
            stop_reason = "MANUAL"
        elif target_status in {"STOPPED", "DISABLED", "ERROR", "EXPIRED"}:
            sync_status = target_status
            stop_reason = "EXPIRED" if target_status == "EXPIRED" else "SYSTEM_ERROR" if target_status == "ERROR" else "MANUAL"
        else:
            sync_status = "EXPIRED"
            stop_reason = "EXPIRED"

        acc.backend_status = sync_status
        self.account_panel.update_card(acc)
        if self.current_account_id == acc.id:
            self.preview_stack.setCurrentWidget(self.placeholder)
            self.top_bar.set_runtime_hint("检测到机器人已停止运行")
        self._sync_robot_runtime_status(acc, sync_status, stop_reason=stop_reason, note="检测到后端停止/禁用/过期状态后同步本地停止结果")
        if acc.id not in self.expiry_notified:
            self.expiry_notified.add(acc.id)
            QMessageBox.information(self, "机器人已停止", f"机器人“{acc.name}”已停止运行。\n原因：{reason}")
            self.on_log("robot", "WARN", f"机器人已自动停止：{acc.name}，原因：{reason}")

    def _release_current_preview(self) -> None:
        if not self.current_account_id:
            return
        controller = self.controllers.get(self.current_account_id)
        if controller:
            controller.release_preview(destroy=False)

    def _show_log_dialog(self, robot_id: str | None = None) -> None:
        self.log_dialog_robot_filter_id = robot_id or None
        gui_log_enabled = self._gui_log_enabled_for_robot(robot_id)
        interface_trace_enabled = self._interface_trace_enabled_for_robot(robot_id)
        if robot_id and not (gui_log_enabled or interface_trace_enabled):
            # PC 后台同时关闭 GUI 日志和接口可视化时，不应再出现日志模块。
            self.log_pending_by_robot.pop(robot_id, None)
            self.request_pending_by_robot.pop(robot_id, None)
            return

        self.log_dialog.set_feature_visibility(
            gui_log_enabled=gui_log_enabled,
            interface_trace_enabled=interface_trace_enabled,
        )
        if robot_id:
            acc = self._known_account(robot_id)
            title = self._robot_log_title(acc, robot_id)
            self.log_dialog.set_context(title, window_title=title)
            lines = self._filtered_log_lines(robot_id)[-GUI_LOG_MAX_LINES:] if gui_log_enabled else []
            requests = self._filtered_request_entries(robot_id)[-GUI_REQUEST_MAX_ROWS:] if interface_trace_enabled else []
            # 切换到某个机器人日志时，只清掉这个机器人的待刷队列，不能清掉其他机器人/总日志。
            self.log_pending_by_robot.pop(robot_id, None)
            self.request_pending_by_robot.pop(robot_id, None)
        else:
            self.log_dialog.set_context("总日志中心", window_title="总日志与接口请求")
            lines = list(self.log_buffer)[-GUI_LOG_MAX_LINES:] if gui_log_enabled else []
            requests = list(self.request_buffer)[-GUI_REQUEST_MAX_ROWS:] if interface_trace_enabled else []
            self.log_pending_lines.clear()
            self.request_pending_entries.clear()
        self.log_dialog.set_lines(lines)
        self.log_dialog.set_request_entries(requests)
        self.log_dialog_snapshot_loaded = True
        self.request_dialog_snapshot_loaded = True
        self.log_dialog.show()
        self.log_dialog.raise_()
        self.log_dialog.activateWindow()

    def _robot_log_title(self, acc: Account | None, robot_id: str) -> str:
        if not acc:
            return f"机器人日志 · {robot_id}"
        short_id = (acc.id or robot_id or "")[:8]
        return f"机器人日志 · {acc.name} · {acc.robot_type_label} · {short_id}"

    def _show_robot_log_dialog(self, robot_id: str) -> None:
        # 查看日志不应切换当前预览或触发 WebEngine 页面释放/重载。
        # 之前这里调用 set_selected_account，可能间接触发 _select_account -> release/open preview，
        # 在视频号 WebEngine 正忙时会导致原生层崩溃。
        self._show_log_dialog(robot_id)

    def _remember_accounts(self, accounts: list[Account]) -> None:
        for acc in accounts or []:
            if acc and acc.id:
                self.known_account_map[acc.id] = acc

    def _register_local_record_accounts(self, accounts: list[Account]) -> None:
        for acc in accounts or []:
            try:
                self.local_record_service.register_account(acc)
            except Exception as exc:
                # 本地记录模块必须旁路降级，不能阻塞机器人列表加载。
                self.logger_bus.emit(
                    "LOCAL_RECORDS",
                    "WARN",
                    f"本地账号注册失败，已忽略：{getattr(acc, 'id', '')}，{type(exc).__name__}: {str(exc)[:160]}",
                )

    def _all_known_accounts(self) -> list[Account]:
        merged: dict[str, Account] = {}
        for source in (self.known_account_map, self.account_map):
            for robot_id, acc in source.items():
                if robot_id and acc:
                    merged[robot_id] = acc
        for robot_id, controller in self.controllers.items():
            acc = getattr(controller, "account", None)
            if robot_id and acc:
                merged[robot_id] = acc
        return list(merged.values())

    def _same_name_robot_count(self, acc: Account) -> int:
        return sum(1 for item in self._all_known_accounts() if item.platform == acc.platform and item.name == acc.name)

    def _looks_like_robot_id(self, value: str) -> bool:
        text = str(value or "").strip()
        if len(text) < 8 or len(text) > 80:
            return False
        return bool(re.fullmatch(r"[A-Za-z0-9_-]+", text))

    def _known_account(self, robot_id: str) -> Account | None:
        if not robot_id:
            return None
        acc = self.account_map.get(robot_id) or self.known_account_map.get(robot_id)
        if acc:
            return acc
        controller = self.controllers.get(robot_id)
        return getattr(controller, "account", None) if controller else None

    def _robot_id_from_scope(self, scope: str) -> str | None:
        text = str(scope or "").strip()
        if not text:
            return None
        # Preferred format emitted by platform controllers: PLATFORM:name | type | robot_id.
        # The trailing robot_id is authoritative even if the robot is not in the current
        # left-list filter.  This is critical when 私信 and 评论 run at the same time:
        # account_map may currently contain only one category, but background logs from
        # the other category must still go to its own buffer instead of falling back to
        # same-name matching.
        parts = [part.strip() for part in text.split("|")]
        if len(parts) >= 3:
            candidate = parts[-1]
            if candidate:
                return candidate
        for robot_id in list(self.account_map.keys()) + list(self.known_account_map.keys()) + list(self.controllers.keys()):
            if robot_id and robot_id in text:
                return robot_id
        return None

    def _robot_id_from_log(self, scope: str, message: str) -> str | None:
        robot_id = self._robot_id_from_scope(scope)
        if robot_id:
            return robot_id

        text = f"{scope} {message}"
        for candidate_id in list(self.account_map.keys()) + list(self.known_account_map.keys()) + list(self.controllers.keys()):
            if candidate_id and candidate_id in text:
                return candidate_id

        # Framework-level logs use scope=robot/auth and include: 名称（私信，robot_id）.
        for acc in self._all_known_accounts():
            typed_prefix = f"{acc.name}（{acc.robot_type_label}"
            if typed_prefix in text:
                return acc.id

        # Name-only matching is a final legacy fallback.  It is deliberately disabled
        # for structured platform scopes because same-name DM/comment robots share the
        # account name by design.  Without this guard, a comment log can be routed into
        # the private-message buffer whenever the current left-list filter only contains
        # the private-message robot.
        if ":" in str(scope or ""):
            return None
        for acc in self._all_known_accounts():
            if self._same_name_robot_count(acc) <= 1 and acc.name and acc.name in text:
                return acc.id
        return None

    def _robot_id_from_request(self, entry: dict[str, Any]) -> str | None:
        if not isinstance(entry, dict):
            return None
        direct = str(entry.get("robot_id") or entry.get("robotId") or "").strip()
        if direct:
            return direct
        haystack = "\n".join(
            str(entry.get(key, ""))
            for key in ("endpoint", "url", "request_body_pretty", "response_body_pretty", "robot_id", "robotId", "robot_name", "platform", "source")
        )
        for candidate_id in list(self.account_map.keys()) + list(self.known_account_map.keys()) + list(self.controllers.keys()):
            if candidate_id and candidate_id in haystack:
                return candidate_id
        return None

    def _trim_pending_buffers(self) -> None:
        if len(self.log_pending_lines) > GUI_LOG_MAX_LINES:
            self.log_pending_lines = self.log_pending_lines[-GUI_LOG_MAX_LINES:]
        if len(self.request_pending_entries) > GUI_REQUEST_MAX_ROWS:
            self.request_pending_entries = self.request_pending_entries[-GUI_REQUEST_MAX_ROWS:]
        for robot_id, lines in list(self.log_pending_by_robot.items()):
            if not lines:
                self.log_pending_by_robot.pop(robot_id, None)
            elif len(lines) > GUI_LOG_MAX_LINES:
                self.log_pending_by_robot[robot_id] = lines[-GUI_LOG_MAX_LINES:]
        for robot_id, entries in list(self.request_pending_by_robot.items()):
            if not entries:
                self.request_pending_by_robot.pop(robot_id, None)
            elif len(entries) > GUI_REQUEST_MAX_ROWS:
                self.request_pending_by_robot[robot_id] = entries[-GUI_REQUEST_MAX_ROWS:]

    def _line_declares_other_robot(self, line: str, robot_id: str) -> bool:
        text = str(line or "")
        # Any known robot id embedded in a structured log line is authoritative.
        for known_id in set(list(self.account_map.keys()) + list(self.known_account_map.keys()) + list(self.controllers.keys())):
            if known_id and known_id != robot_id and known_id in text:
                return True
        # Platform logs now look like: [DOUYIN:name | 私信 | robot_id].  If a line uses
        # that structure and the trailing id is not the requested robot id, it must not
        # appear in this robot's dialog even if the account name is the same.
        match = re.search(r"\[[A-Z_]+:[^\]]+\|\s*[^\]|]+\s*\|\s*([^\]]+)\]", text)
        if match:
            declared_id = match.group(1).strip()
            if declared_id and declared_id != robot_id:
                return True
        return False

    def _line_matches_robot(self, line: str, robot_id: str) -> bool:
        acc = self._known_account(robot_id)
        text = str(line or "")
        if not robot_id:
            return False
        if self._line_declares_other_robot(text, robot_id):
            return False
        if robot_id in text:
            return True
        if not acc:
            return False

        # New logs include the unique account.log_scope, which contains platform +
        # managed name + module label + robot id.  This is the only reliable way to
        # split logs for same-name DM/comment robots.
        log_scope = getattr(acc, "log_scope", "")
        if log_scope and f"[{log_scope}]" in text:
            return True

        typed_name = f"{acc.name}（{acc.robot_type_label}"
        if typed_name in text:
            return True

        # Legacy fallback: only use name-based matching when no other same-name robot is
        # known in this GUI session.  The count uses known_account_map/controllers, not
        # just the currently visible tab, so switching between 私信/评论 will not make a
        # same-name robot appear unique by accident.
        if self._same_name_robot_count(acc) <= 1:
            legacy_scope = f"[{acc.platform}:{acc.name}]"
            if legacy_scope in text:
                return True
            if acc.name and acc.name in text:
                return True
            if acc.bound_account_display and acc.bound_account_display != "--" and acc.bound_account_display in text:
                return True
        return False

    def _filtered_log_lines(self, robot_id: str) -> list[str]:
        # Per-robot buffers are authoritative, but still re-check each line before showing
        # it.  This purges any line that may have been misrouted by older builds or by a
        # temporary current-tab account_map mismatch.
        robot_lines = self.robot_log_buffers.get(robot_id)
        source = list(robot_lines) if robot_lines is not None else list(self.log_buffer)
        return [line for line in source if self._line_matches_robot(line, robot_id)]

    def _request_matches_robot(self, entry: dict[str, Any], robot_id: str) -> bool:
        acc = self._known_account(robot_id)
        haystack = "\n".join(
            str(entry.get(key, ""))
            for key in ("endpoint", "url", "request_body_pretty", "response_body_pretty", "robot_id", "robotId", "robot_name", "platform", "source")
        )
        for known_id in set(list(self.account_map.keys()) + list(self.known_account_map.keys()) + list(self.controllers.keys())):
            if known_id and known_id != robot_id and known_id in haystack:
                return False
        if robot_id and robot_id in haystack:
            return True
        if acc and acc.auth_id and acc.auth_id in haystack:
            return True
        if acc and acc.device_id and acc.device_id in haystack:
            return True
        if acc and self._same_name_robot_count(acc) <= 1 and acc.name and acc.name in haystack:
            return True
        return False

    def _filtered_request_entries(self, robot_id: str) -> list[dict[str, Any]]:
        robot_entries = self.robot_request_buffers.get(robot_id)
        source = list(robot_entries) if robot_entries is not None else list(self.request_buffer)
        return [entry for entry in source if self._request_matches_robot(entry, robot_id)]

    def _diagnostics_account(self, robot_id: str | None) -> Account | None:
        if not robot_id:
            return None
        controller = self.controllers.get(robot_id)
        acc = getattr(controller, "account", None) if controller else None
        return acc or self.account_map.get(robot_id) or self.known_account_map.get(robot_id)

    def _diagnostics_policy(self, robot_id: str | None) -> dict[str, Any]:
        acc = self._diagnostics_account(robot_id)
        config = getattr(acc, "config", {}) if acc is not None else {}
        runtime_policy = config.get("runtimePolicy") if isinstance(config, dict) and isinstance(config.get("runtimePolicy"), dict) else {}
        policy = normalize_runtime_policy(runtime_policy)
        diagnostics = policy.get("diagnostics") if isinstance(policy.get("diagnostics"), dict) else {}
        return diagnostics

    def _gui_log_enabled_for_robot(self, robot_id: str | None) -> bool:
        if not robot_id:
            return True
        diagnostics = self._diagnostics_policy(robot_id)
        return diagnostics.get("guiLogEnabled") is not False

    def _interface_trace_enabled_for_robot(self, robot_id: str | None) -> bool:
        if not robot_id:
            return True
        diagnostics = self._diagnostics_policy(robot_id)
        return diagnostics.get("interfaceTraceEnabled") is not False

    def on_log(self, scope: str, level: str, message: str) -> None:
        robot_id = self._robot_id_from_log(scope, message)
        level_text = str(level or "").upper()
        if robot_id and not self._gui_log_enabled_for_robot(robot_id):
            # GUI 日志由 PC 后台 runtimePolicy.diagnostics.guiLogEnabled 控制。
            # 关闭后不再写入全局/单机器人日志缓存，也不刷新日志窗口，以降低长期运行压力。
            if level_text == "ERROR":
                self._maybe_report_runtime_anomaly(scope, level_text, message)
            return
        ts = datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] [{level}] [{scope}] {message}"
        self.log_buffer.append(line)
        self.log_pending_lines.append(line)
        if robot_id:
            robot_buffer = self.robot_log_buffers.setdefault(robot_id, deque(maxlen=GUI_LOG_MAX_LINES))
            robot_buffer.append(line)
            self.log_pending_by_robot.setdefault(robot_id, []).append(line)
        self._trim_pending_buffers()
        self._maybe_report_runtime_anomaly(scope, level_text, message)

    def on_request(self, entry: dict[str, Any]) -> None:
        robot_id = self._robot_id_from_request(entry)
        if robot_id and not self._interface_trace_enabled_for_robot(robot_id):
            return
        self.request_buffer.append(entry)
        self.request_pending_entries.append(entry)
        if robot_id:
            robot_buffer = self.robot_request_buffers.setdefault(robot_id, deque(maxlen=GUI_REQUEST_MAX_ROWS))
            robot_buffer.append(entry)
            self.request_pending_by_robot.setdefault(robot_id, []).append(entry)
        self._trim_pending_buffers()

    def _flush_dialog_buffers(self) -> None:
        if self.log_dialog.isVisible():
            robot_id = self.log_dialog_robot_filter_id
            if robot_id:
                raw_lines = self.log_pending_by_robot.pop(robot_id, [])
                if self._gui_log_enabled_for_robot(robot_id):
                    lines = [line for line in raw_lines if self._line_matches_robot(line, robot_id)]
                    if lines:
                        self.log_dialog.append_lines(lines[-GUI_LOG_APPEND_BATCH:])
                entries = self.request_pending_by_robot.pop(robot_id, [])
                if entries and self._interface_trace_enabled_for_robot(robot_id):
                    append_many = getattr(self.log_dialog, "append_request_entries", None)
                    if callable(append_many):
                        append_many(entries[-GUI_REQUEST_MAX_ROWS:])
                    else:
                        for entry in entries[-GUI_REQUEST_MAX_ROWS:]:
                            self.log_dialog.append_request_entry(entry)
            else:
                if self.log_pending_lines:
                    self.log_dialog.append_lines(self.log_pending_lines[-GUI_LOG_APPEND_BATCH:])
                if self.request_pending_entries:
                    append_many = getattr(self.log_dialog, "append_request_entries", None)
                    if callable(append_many):
                        append_many(self.request_pending_entries[-GUI_REQUEST_MAX_ROWS:])
                    else:
                        for entry in self.request_pending_entries[-GUI_REQUEST_MAX_ROWS:]:
                            self.log_dialog.append_request_entry(entry)
                self.log_pending_lines.clear()
                self.request_pending_entries.clear()
            self._trim_pending_buffers()
            return
        self._trim_pending_buffers()
        self.log_dialog_snapshot_loaded = False
        self.request_dialog_snapshot_loaded = False

    def _compact_gui_log_buffers(self) -> None:
        # log_buffer/request_buffer 和 per-robot buffer 自身使用 deque(maxlen=...) 控制内存；
        # 这里额外压缩所有待刷队列，避免日志窗口长时间关闭后堆积。
        self._trim_pending_buffers()
        if self.log_dialog.isVisible():
            robot_id = self.log_dialog_robot_filter_id
            lines = self._filtered_log_lines(robot_id)[-GUI_LOG_MAX_LINES:] if robot_id else list(self.log_buffer)[-GUI_LOG_MAX_LINES:]
            self.log_dialog.set_lines(lines)
        self.on_log("system", "INFO", f"已自动压缩 GUI 日志，最多保留最近 {GUI_LOG_MAX_LINES} 行。")

    def _maybe_report_runtime_anomaly(self, scope: str, level: str, message: str) -> None:
        if level != "ERROR":
            return
        acc = self._account_for_log_scope(scope)
        if not acc or not acc.id or not self.session or not self.session.access_token:
            return
        safe_message = self._sanitize_anomaly_message(message)
        if not safe_message:
            return
        category = self._classify_anomaly_message(safe_message)
        fingerprint_source = f"{acc.id}|{level}|{category}|{safe_message[:160]}"
        fingerprint = hashlib.sha1(fingerprint_source.encode("utf-8", errors="ignore")).hexdigest()
        now = time.monotonic()
        last_at = self._anomaly_reported_at.get(fingerprint, 0.0)
        if now - last_at < ANOMALY_REPORT_COOLDOWN_SEC:
            return
        self._anomaly_reported_at[fingerprint] = now
        if len(self._anomaly_reported_at) > 256:
            cutoff = now - 3600.0
            self._anomaly_reported_at = {k: v for k, v in self._anomaly_reported_at.items() if v >= cutoff}

        base_url = self.core_service.current_base_url
        access_token = self.session.access_token
        tenant_id = self.session.tenant_id or self.core_service.current_tenant_id
        last_error = f"[{level}] {category}: {safe_message}"[:900]
        try:
            acc.last_error = last_error
        except Exception:
            pass
        self._anomaly_report_executor.submit(
            self._send_runtime_anomaly_report,
            base_url,
            access_token,
            tenant_id,
            acc.id,
            last_error,
        )

    def _account_for_log_scope(self, scope: str) -> Account | None:
        text = str(scope or "").strip()
        if not text or ":" not in text:
            return None

        # Preferred new format: PLATFORM:name | type | robot_id
        parts = [part.strip() for part in text.split("|")]
        if len(parts) >= 3:
            robot_id = parts[-1]
            acc = self.account_map.get(robot_id)
            if acc:
                return acc

        platform, name_part = text.split(":", 1)
        platform = platform.strip().upper()
        name = name_part.split("|", 1)[0].strip()
        candidates = [acc for acc in self.account_map.values() if acc.platform == platform and acc.name == name]
        if len(candidates) == 1:
            return candidates[0]
        for acc in self.account_map.values():
            if acc.platform == platform and acc.id and acc.id in text:
                return acc
        return None

    def _sanitize_anomaly_message(self, message: str) -> str:
        text = re.sub(r"\s+", " ", str(message or "")).strip()
        if not text:
            return ""
        text = re.sub(r"(?i)(authorization|cookie|token|session|csrf|passport)([\w_\-]*)(\s*[:=]\s*)[^,;\s}]+", r"\1\2\3***", text)
        text = re.sub(r"https?://[^\s,}]+", "<url>", text)
        text = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "<email>", text)
        text = re.sub(r"(?<!\d)1[3-9]\d{9}(?!\d)", "<phone>", text)
        text = re.sub(r"(?i)(content|summary|text|message|draftPreview|expectedPreview)([=:：]\s*)[^,，}]{12,}", r"\1\2<masked>", text)
        return text[:700]

    def _classify_anomaly_message(self, message: str) -> str:
        text = message.lower()
        if any(key in message for key in ("登录", "授权", "扫码")):
            return "LOGIN_OR_AUTH"
        if any(key in message for key in ("发送", "send", "按钮")):
            return "SEND_FAILED"
        if any(key in message for key in ("后端", "接口", "HTTP", "ApiError")) or "api" in text:
            return "BACKEND_API_FAILED"
        if any(key in message for key in ("Coze", "扣子", "工作流")):
            return "COZE_FAILED"
        if any(key in message for key in ("DOM", "元素", "页面结构", "selector")) or "dom" in text:
            return "DOM_MISSING"
        return "UNKNOWN"

    @staticmethod
    def _send_runtime_anomaly_report(base_url: str, access_token: str, tenant_id: str, robot_id: str, last_error: str) -> None:
        if not base_url or not access_token or not robot_id:
            return
        url = f"{base_url.rstrip('/')}/api/v1/robots/{robot_id}/runtime-status"
        headers = {"Accept": "application/json", "Content-Type": "application/json", "Authorization": f"Bearer {access_token}"}
        if tenant_id:
            headers["X-Tenant-Id"] = tenant_id
        try:
            requests.patch(url, json={"status": "RUNNING", "lastError": last_error}, headers=headers, timeout=8)
        except Exception:
            # 异常上报不能影响机器人主流程。
            return

    def _stop_all_local_robots_for_shutdown(self) -> None:
        """GUI 关闭时停止所有本地机器人，并尽量把后端运行态同步为 STOPPED。"""
        if self._shutdown_done:
            return
        self._shutdown_done = True
        seen: set[str] = set()
        for robot_id, controller in list(self.controllers.items()):
            acc = self.account_map.get(robot_id) or getattr(controller, "account", None)
            was_running = False
            try:
                was_running = bool(getattr(controller, "is_running", lambda: False)())
            except Exception:
                was_running = False
            try:
                if hasattr(controller, "stop"):
                    controller.stop()
            except Exception as exc:
                self.on_log("robot", "WARN", f"关闭 GUI 时停止本地机器人失败：{robot_id}，{type(exc).__name__}: {str(exc)[:120]}")
            try:
                if acc and (was_running or str(getattr(acc, "runtime_status", "") or "") in {"启动中", "待扫码", "模块加载中", "运行中", "RUNNING", "STARTING"} or str(getattr(acc, "backend_status", "") or "") == "RUNNING"):
                    self._sync_robot_runtime_status(acc, "STOPPED", stop_reason="MANUAL", note="GUI 关闭时同步本地停止状态")
                    acc.runtime_status = "已停止"
                    seen.add(robot_id)
            except Exception:
                pass
            try:
                if hasattr(controller, "shutdown_webengine"):
                    controller.shutdown_webengine()
            except Exception:
                pass
        # 如果列表里还有已标记运行、但控制器未创建/已被释放的机器人，也做一次保守同步。
        for acc in list(self.account_map.values()):
            if acc.id in seen:
                continue
            try:
                if acc.can_stop or str(acc.runtime_status or "").strip() in {"启动中", "运行中", "RUNNING", "STARTING"}:
                    self._sync_robot_runtime_status(acc, "STOPPED", stop_reason="MANUAL", note="GUI 关闭时同步本地停止状态")
                    acc.runtime_status = "已停止"
            except Exception:
                pass

    def closeEvent(self, event) -> None:
        try:
            self.log_flush_timer.stop()
            self.log_compact_timer.stop()
            self.robot_monitor_timer.stop()
        except Exception:
            pass
        try:
            self.local_record_service.begin_draining()
        except Exception:
            pass
        self._stop_all_local_robots_for_shutdown()
        try:
            self.local_record_service.close(timeout=3.0)
        except Exception as exc:
            self.logger_bus.emit(
                "LOCAL_RECORDS",
                "WARN",
                f"关闭本地记录服务失败，剩余事件将依赖恢复文件：{type(exc).__name__}: {str(exc)[:200]}",
            )
        try:
            self._anomaly_report_executor.shutdown(wait=False, cancel_futures=True)
        except Exception:
            pass
        super().closeEvent(event)
