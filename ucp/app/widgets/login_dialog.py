from __future__ import annotations

from dataclasses import dataclass

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QLabel,
    QHBoxLayout,
    QLineEdit,
    QToolButton,
    QVBoxLayout,
)


@dataclass(slots=True)
class LoginFormData:
    base_url: str
    username: str
    password: str
    remember: bool


class LoginDialog(QDialog):
    def __init__(self, *, base_url: str = "http://localhost:3000", username: str = "") -> None:
        super().__init__()
        self.setObjectName("LoginDialog")
        self.setWindowTitle("登录 core-nexus")
        self.setModal(True)
        self.setMinimumWidth(420)

        root = QVBoxLayout(self)
        root.setContentsMargins(22, 22, 22, 22)
        root.setSpacing(14)

        title = QLabel("登录 core-nexus 后端")
        title.setObjectName("DialogTitle")
        root.addWidget(title)

        tip = QLabel("登录后会根据账号可访问租户自动选择或弹出租户选择窗口。")
        tip.setObjectName("DialogTip")
        tip.setWordWrap(True)
        root.addWidget(tip)

        form = QFormLayout()
        form.setLabelAlignment(Qt.AlignmentFlag.AlignRight)
        form.setHorizontalSpacing(12)
        form.setVerticalSpacing(12)

        self.base_url_input = QLineEdit(base_url)
        self.base_url_input.setPlaceholderText("http://localhost:3000")
        form.addRow("API地址", self.base_url_input)

        self.username_input = QLineEdit(username)
        self.username_input.setPlaceholderText("请输入用户名")
        form.addRow("用户名", self.username_input)

        self.password_input = QLineEdit()
        self.password_input.setPlaceholderText("请输入密码")
        self.password_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.password_visible_button = QToolButton()
        self.password_visible_button.setText("显示")
        self.password_visible_button.setCheckable(True)
        self.password_visible_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.password_visible_button.toggled.connect(self._toggle_password_visible)
        password_row = QHBoxLayout()
        password_row.setContentsMargins(0, 0, 0, 0)
        password_row.setSpacing(8)
        password_row.addWidget(self.password_input, 1)
        password_row.addWidget(self.password_visible_button, 0)
        form.addRow("密码", password_row)

        root.addLayout(form)

        self.remember_checkbox = QCheckBox("记住 API 地址和用户名")
        self.remember_checkbox.setChecked(True)
        root.addWidget(self.remember_checkbox)

        self.buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        self.buttons.button(QDialogButtonBox.StandardButton.Ok).setText("登录")
        self.buttons.button(QDialogButtonBox.StandardButton.Cancel).setText("取消")
        self.buttons.accepted.connect(self._validate_and_accept)
        self.buttons.rejected.connect(self.reject)
        root.addWidget(self.buttons)


    def _toggle_password_visible(self, visible: bool) -> None:
        self.password_input.setEchoMode(QLineEdit.EchoMode.Normal if visible else QLineEdit.EchoMode.Password)
        self.password_visible_button.setText("隐藏" if visible else "显示")

    def values(self) -> LoginFormData:
        return LoginFormData(
            base_url=self.base_url_input.text().strip().rstrip("/"),
            username=self.username_input.text().strip(),
            password=self.password_input.text(),
            remember=self.remember_checkbox.isChecked(),
        )

    def _validate_and_accept(self) -> None:
        data = self.values()
        if not data.base_url or not data.username or not data.password:
            return
        self.accept()
