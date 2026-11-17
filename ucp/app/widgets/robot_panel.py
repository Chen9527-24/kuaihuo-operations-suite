from __future__ import annotations

from PySide6.QtCore import Signal
from PySide6.QtWidgets import QFrame, QGridLayout, QHBoxLayout, QLabel, QPushButton, QVBoxLayout

from app.models import Account


class InfoRow(QFrame):
    def __init__(self, title: str, value: str = "-") -> None:
        super().__init__()
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(2)
        self.title = QLabel(title)
        self.title.setObjectName("InfoTitleLabel")
        self.value = QLabel(value)
        self.value.setObjectName("InfoValueLabel")
        self.value.setWordWrap(True)
        lay.addWidget(self.title)
        lay.addWidget(self.value)

    def set_value(self, value: str) -> None:
        self.value.setText(value or "-")


class RobotManagementPanel(QFrame):
    start_requested = Signal(str)
    stop_requested = Signal(str)

    def __init__(self) -> None:
        super().__init__()
        self.setObjectName("RobotInfoPanel")
        self.robot_id = ""
        self.current_account: Account | None = None

        root = QVBoxLayout(self)
        root.setContentsMargins(16, 14, 16, 14)
        root.setSpacing(12)

        header = QHBoxLayout()
        title = QLabel("机器人信息")
        title.setObjectName("SectionTitle")
        header.addWidget(title)
        header.addStretch(1)

        self.start_btn = QPushButton("启动")
        self.start_btn.setObjectName("PrimaryActionButton")
        self.start_btn.clicked.connect(self._start)
        header.addWidget(self.start_btn)

        self.stop_btn = QPushButton("停止")
        self.stop_btn.setObjectName("DangerActionButton")
        self.stop_btn.clicked.connect(self._stop)
        header.addWidget(self.stop_btn)
        root.addLayout(header)

        grid = QGridLayout()
        grid.setHorizontalSpacing(16)
        grid.setVerticalSpacing(10)
        root.addLayout(grid)

        self.name_field = InfoRow("机器人名称")
        self.id_field = InfoRow("机器人 ID")
        self.type_field = InfoRow("机器人类型")
        self.platform_field = InfoRow("所属平台")
        self.runtime_field = InfoRow("运行状态")
        self.backend_field = InfoRow("后端状态")
        self.auth_field = InfoRow("绑定账号")
        self.auth_status_field = InfoRow("授权状态")
        self.device_field = InfoRow("执行设备")
        self.device_status_field = InfoRow("设备状态")
        self.remark_field = InfoRow("备注")

        fields = [
            self.name_field,
            self.id_field,
            self.type_field,
            self.platform_field,
            self.runtime_field,
            self.backend_field,
            self.auth_field,
            self.auth_status_field,
            self.device_field,
            self.device_status_field,
            self.remark_field,
        ]
        for idx, field in enumerate(fields):
            row = idx // 2
            col = idx % 2
            if field is self.remark_field:
                grid.addWidget(field, row + 1, 0, 1, 2)
            else:
                grid.addWidget(field, row, col)

        self.set_account(None)

    def _apply_action_state(self) -> None:
        account = self.current_account
        if not account:
            self.start_btn.setEnabled(False)
            self.stop_btn.setEnabled(False)
            return
        self.start_btn.setEnabled(bool(account.can_start))
        self.stop_btn.setEnabled(bool(account.can_stop))
        if account.is_backend_disabled:
            self.start_btn.setToolTip("机器人已禁用/过期，不能启动")
            self.stop_btn.setToolTip("机器人已禁用/过期，无需停止")
        else:
            self.start_btn.setToolTip("当前机器人已在运行或启动流程中" if not account.can_start else "启动本地机器人会话")
            self.stop_btn.setToolTip("当前机器人未运行" if not account.can_stop else "停止本地机器人会话")

    def set_account(self, account: Account | None) -> None:
        self.current_account = account
        self.robot_id = account.id if account else ""
        self.name_field.set_value(account.name if account else "-")
        self.id_field.set_value(account.id if account else "-")
        self.type_field.set_value(account.robot_type_label if account else "-")
        self.platform_field.set_value(account.platform_label if account else "-")
        self.runtime_field.set_value(account.runtime_status if account else "-")
        self.backend_field.set_value(account.backend_status_label if account else "-")
        self.auth_field.set_value((account.auth_name or account.auth_uid or "未授权") if account else "-")
        self.auth_status_field.set_value(account.auth_status_label if account else "-")
        self.device_field.set_value((account.device_name or account.device_code or "未配置") if account else "-")
        self.device_status_field.set_value(account.device_status_label if account else "-")
        self.remark_field.set_value(account.remark or "-") if account else self.remark_field.set_value("-")
        self._apply_action_state()

    def update_runtime_status(self, value: str) -> None:
        self.runtime_field.set_value(value)
        if self.current_account:
            self.current_account.runtime_status = value
        self._apply_action_state()

    def _start(self) -> None:
        if self.robot_id and self.current_account and self.current_account.can_start:
            self.start_requested.emit(self.robot_id)

    def _stop(self) -> None:
        if self.robot_id and self.current_account and self.current_account.can_stop:
            self.stop_requested.emit(self.robot_id)
