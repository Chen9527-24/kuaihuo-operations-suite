from __future__ import annotations

from PySide6.QtCore import QSize, Qt, Signal
from PySide6.QtWidgets import (
    QButtonGroup,
    QFrame,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from app.models import Account


RUNTIME_COLORS = {
    "未启动": "#94A3B8",
    "启动中": "#F59E0B",
    "待扫码": "#3B82F6",
    "已扫码": "#2563EB",
    "模块加载中": "#8B5CF6",
    "运行中": "#10B981",
    "停止中": "#F97316",
    "已停止": "#64748B",
    "已禁用": "#475569",
    "错误": "#EF4444",
}


def _apply_card_button_state(start_btn: QPushButton | None, stop_btn: QPushButton | None, acc: Account) -> None:
    start_enabled = bool(acc.can_start)
    stop_enabled = bool(acc.can_stop)
    if start_btn:
        start_btn.setEnabled(start_enabled)
        if acc.is_backend_disabled:
            start_btn.setToolTip("机器人已禁用/过期，不能启动")
        elif not start_enabled:
            start_btn.setToolTip("当前机器人已在运行或启动流程中")
        else:
            start_btn.setToolTip("启动本地机器人会话")
    if stop_btn:
        stop_btn.setEnabled(stop_enabled)
        if acc.is_backend_disabled:
            stop_btn.setToolTip("机器人已禁用/过期，无需停止")
        elif not stop_enabled:
            stop_btn.setToolTip("当前机器人未运行")
        else:
            stop_btn.setToolTip("停止本地机器人会话")


def _diagnostics_visibility(acc: Account) -> tuple[bool, bool, bool]:
    """Return (gui_log_enabled, interface_trace_enabled, any_visible).

    Diagnostics defaults are intentionally permissive for old robots that do not
    yet carry runtimePolicy.diagnostics. PC can explicitly set either flag to
    false to hide the corresponding GUI module.
    """
    config = acc.config if isinstance(getattr(acc, "config", None), dict) else {}
    runtime_policy = config.get("runtimePolicy") if isinstance(config.get("runtimePolicy"), dict) else {}
    diagnostics = runtime_policy.get("diagnostics") if isinstance(runtime_policy.get("diagnostics"), dict) else {}
    gui_log_enabled = diagnostics.get("guiLogEnabled") is not False
    interface_trace_enabled = diagnostics.get("interfaceTraceEnabled") is not False
    return gui_log_enabled, interface_trace_enabled, bool(gui_log_enabled or interface_trace_enabled)


class AccountListPanel(QFrame):
    account_selected = Signal(str)
    refresh_requested = Signal()
    robot_type_changed = Signal(str)
    start_requested = Signal(str)
    stop_requested = Signal(str)
    logout_requested = Signal(str)
    log_requested = Signal(str)

    def __init__(self) -> None:
        super().__init__()
        self.setObjectName("AccountListPanel")
        self._id_to_item: dict[str, QListWidgetItem] = {}

        root = QVBoxLayout(self)
        root.setContentsMargins(16, 18, 16, 18)
        root.setSpacing(12)

        header = QHBoxLayout()
        title = QLabel("机器人列表")
        title.setObjectName("SectionTitle")
        header.addWidget(title)
        header.addStretch(1)
        refresh = QPushButton("刷新")
        refresh.setObjectName("GhostButton")
        refresh.clicked.connect(self.refresh_requested.emit)
        header.addWidget(refresh)
        root.addLayout(header)

        tab_row = QHBoxLayout()
        tab_row.setSpacing(8)
        self.type_group = QButtonGroup(self)
        self.type_group.setExclusive(True)
        self.type_buttons: dict[str, QPushButton] = {}
        for key, text in (("PRIVATE_MESSAGE", "私信"), ("COMMENT_REPLY", "评论")):
            btn = QPushButton(text)
            btn.setCheckable(True)
            btn.setObjectName("InlineFilterButton")
            btn.clicked.connect(lambda checked=False, robot_type=key: self.robot_type_changed.emit(robot_type))
            self.type_group.addButton(btn)
            self.type_buttons[key] = btn
            tab_row.addWidget(btn)
        self.type_buttons["PRIVATE_MESSAGE"].setChecked(True)
        tab_row.addStretch(1)
        root.addLayout(tab_row)

        self.list_widget = QListWidget()
        self.list_widget.setObjectName("RobotListWidget")
        self.list_widget.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.list_widget.setSpacing(10)
        self.list_widget.itemSelectionChanged.connect(self._on_selected)
        root.addWidget(self.list_widget, 1)

    def set_robot_type(self, robot_type: str) -> None:
        if robot_type in self.type_buttons:
            self.type_buttons[robot_type].setChecked(True)

    def set_accounts(self, accounts: list[Account]) -> None:
        self.list_widget.clear()
        self._id_to_item.clear()
        for acc in accounts:
            item = QListWidgetItem()
            item.setData(Qt.ItemDataRole.UserRole, acc.id)
            widget = self._build_card(acc)
            item.setSizeHint(QSize(0, 176))
            self.list_widget.addItem(item)
            self.list_widget.setItemWidget(item, widget)
            self._id_to_item[acc.id] = item
        if accounts:
            self.list_widget.setCurrentRow(0)

    def set_selected_account(self, account_id: str) -> None:
        item = self._id_to_item.get(account_id)
        if item:
            self.list_widget.setCurrentItem(item)

    def update_card(self, acc: Account) -> None:
        item = self._id_to_item.get(acc.id)
        if not item:
            return
        widget = self.list_widget.itemWidget(item)
        if not widget:
            return
        runtime = widget.findChild(QLabel, "runtimeLabel")
        if runtime:
            runtime.setText(acc.runtime_status)
            runtime.setStyleSheet(
                f"background:{RUNTIME_COLORS.get(acc.runtime_status, '#94A3B8')};"
                "color:white;font-size:11px;font-weight:700;border-radius:10px;padding:4px 8px;"
            )
        bound = widget.findChild(QLabel, "boundAccountLabel")
        if bound:
            bound.setText(f"绑定账号：{acc.bound_account_display}")
        expire = widget.findChild(QLabel, "expireLabel")
        if expire:
            expire.setText(f"到期时间：{acc.expire_at_display}")
        log_btn = widget.findChild(QPushButton, "CardIconLogButton")
        if log_btn:
            gui_log_enabled, interface_trace_enabled, diagnostics_visible = _diagnostics_visibility(acc)
            log_btn.setVisible(diagnostics_visible)
            log_btn.setEnabled(diagnostics_visible)
            if diagnostics_visible:
                if gui_log_enabled and interface_trace_enabled:
                    log_btn.setToolTip("查看当前机器人日志与接口请求")
                elif gui_log_enabled:
                    log_btn.setToolTip("查看当前机器人运行日志")
                else:
                    log_btn.setToolTip("查看当前机器人接口请求")
            else:
                log_btn.setToolTip("PC 后台已关闭 GUI 日志与接口可视化")
        start_btn = widget.findChild(QPushButton, "CardStartButton")
        stop_btn = widget.findChild(QPushButton, "CardStopButton")
        _apply_card_button_state(start_btn, stop_btn, acc)

    def _build_card(self, acc: Account) -> QWidget:
        box = QFrame()
        box.setObjectName("AccountCard")
        lay = QVBoxLayout(box)
        lay.setContentsMargins(14, 12, 14, 12)
        lay.setSpacing(8)

        header_row = QHBoxLayout()
        header_row.setSpacing(8)

        name_wrap = QVBoxLayout()
        name_wrap.setSpacing(3)

        name_row = QHBoxLayout()
        name_row.setSpacing(6)
        name = QLabel(acc.name)
        name.setObjectName("AccountName")
        name.setWordWrap(False)
        name.setToolTip(acc.name)
        name_row.addWidget(name, 1)

        log_icon = QPushButton("日志")
        log_icon.setObjectName("CardIconLogButton")
        gui_log_enabled, interface_trace_enabled, diagnostics_visible = _diagnostics_visibility(acc)
        if gui_log_enabled and interface_trace_enabled:
            log_icon.setToolTip("查看当前机器人日志与接口请求")
        elif gui_log_enabled:
            log_icon.setToolTip("查看当前机器人运行日志")
        elif interface_trace_enabled:
            log_icon.setToolTip("查看当前机器人接口请求")
        else:
            log_icon.setToolTip("PC 后台已关闭 GUI 日志与接口可视化")
        log_icon.setVisible(diagnostics_visible)
        log_icon.setEnabled(diagnostics_visible)
        log_icon.clicked.connect(lambda _=False, robot_id=acc.id: self._emit_log(robot_id))
        name_row.addWidget(log_icon, 0, Qt.AlignmentFlag.AlignTop)
        name_wrap.addLayout(name_row)

        type_label = QLabel("私信机器人" if acc.robot_type == "PRIVATE_MESSAGE" else "评论机器人")
        type_label.setObjectName("RobotTypeLabel")
        name_wrap.addWidget(type_label)
        header_row.addLayout(name_wrap, 1)

        runtime = QLabel(acc.runtime_status)
        runtime.setObjectName("runtimeLabel")
        runtime.setStyleSheet(
            f"background:{RUNTIME_COLORS.get(acc.runtime_status, '#94A3B8')};"
            "color:white;font-size:11px;font-weight:800;border-radius:10px;padding:4px 9px;"
        )
        header_row.addWidget(runtime, 0, Qt.AlignmentFlag.AlignTop)
        lay.addLayout(header_row)

        meta_box = QFrame()
        meta_box.setObjectName("AccountMetaPanel")
        meta_lay = QVBoxLayout(meta_box)
        meta_lay.setContentsMargins(10, 8, 10, 8)
        meta_lay.setSpacing(4)

        bound = QLabel(f"绑定账号：{acc.bound_account_display}")
        bound.setObjectName("boundAccountLabel")
        bound.setWordWrap(False)
        bound.setToolTip(acc.bound_account_display)
        meta_lay.addWidget(bound)

        expire = QLabel(f"到期时间：{acc.expire_at_display}")
        expire.setObjectName("expireLabel")
        expire.setWordWrap(False)
        meta_lay.addWidget(expire)
        lay.addWidget(meta_box)

        primary_row = QHBoxLayout()
        primary_row.setSpacing(8)
        start_btn = QPushButton("启动")
        start_btn.setObjectName("CardStartButton")
        start_btn.clicked.connect(lambda _=False, robot_id=acc.id: self._emit_start(robot_id))
        primary_row.addWidget(start_btn, 1)

        stop_btn = QPushButton("停止")
        stop_btn.setObjectName("CardStopButton")
        stop_btn.clicked.connect(lambda _=False, robot_id=acc.id: self._emit_stop(robot_id))
        primary_row.addWidget(stop_btn, 1)
        lay.addLayout(primary_row)

        _apply_card_button_state(start_btn, stop_btn, acc)
        box.setMinimumHeight(160)
        box.setMaximumHeight(170)
        return box

    def _emit_log(self, robot_id: str) -> None:
        # 打开日志不切换卡片选中态，避免触发当前 WebEngine 预览释放/重载。
        self.log_requested.emit(robot_id)

    def _emit_start(self, robot_id: str) -> None:
        self.set_selected_account(robot_id)
        self.start_requested.emit(robot_id)

    def _emit_stop(self, robot_id: str) -> None:
        self.set_selected_account(robot_id)
        self.stop_requested.emit(robot_id)

    def _emit_logout(self, robot_id: str) -> None:
        self.set_selected_account(robot_id)
        self.logout_requested.emit(robot_id)

    def _on_selected(self) -> None:
        items = self.list_widget.selectedItems()
        if not items:
            return
        account_id = items[0].data(Qt.ItemDataRole.UserRole)
        if account_id:
            self.account_selected.emit(account_id)
