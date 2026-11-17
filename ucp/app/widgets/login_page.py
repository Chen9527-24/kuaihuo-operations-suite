from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QCheckBox,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QToolButton,
    QVBoxLayout,
    QWidget,
)


class LoginPage(QWidget):
    login_requested = Signal(str, str, bool)

    def __init__(self) -> None:
        super().__init__()
        root = QVBoxLayout(self)
        root.setContentsMargins(28, 28, 28, 28)
        root.addStretch(1)

        center = QHBoxLayout()
        center.addStretch(1)

        card = QFrame()
        card.setObjectName("LoginCard")
        card.setMaximumWidth(500)
        card_lay = QVBoxLayout(card)
        card_lay.setContentsMargins(42, 40, 42, 40)
        card_lay.setSpacing(16)

        logo = QLabel("UC")
        logo.setObjectName("LoginLogo")
        logo.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_lay.addWidget(logo, 0, Qt.AlignmentFlag.AlignHCenter)

        title = QLabel("UCP 工作台")
        title.setObjectName("LoginTitle")
        title.setAlignment(Qt.AlignmentFlag.AlignHCenter)
        card_lay.addWidget(title)

        subtitle = QLabel("私信与评论机器人统一控制入口")
        subtitle.setObjectName("LoginSubtitle")
        subtitle.setAlignment(Qt.AlignmentFlag.AlignHCenter)
        card_lay.addWidget(subtitle)
        card_lay.addSpacing(8)

        self.username_edit = QLineEdit()
        self.username_edit.setPlaceholderText("请输入账号")
        self.username_edit.setObjectName("LoginInput")
        card_lay.addWidget(self._label("账号"))
        card_lay.addWidget(self.username_edit)

        self.password_edit = QLineEdit()
        self.password_edit.setPlaceholderText("请输入密码")
        self.password_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.password_edit.setObjectName("LoginInput")
        self.password_visible_button = QToolButton()
        self.password_visible_button.setText("显示")
        self.password_visible_button.setCheckable(True)
        self.password_visible_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.password_visible_button.setObjectName("LoginPasswordToggle")
        self.password_visible_button.toggled.connect(self._toggle_password_visible)
        password_row = QHBoxLayout()
        password_row.setContentsMargins(0, 0, 0, 0)
        password_row.setSpacing(8)
        password_row.addWidget(self.password_edit, 1)
        password_row.addWidget(self.password_visible_button, 0)
        card_lay.addWidget(self._label("密码"))
        card_lay.addLayout(password_row)

        option_row = QHBoxLayout()
        option_row.setContentsMargins(0, 0, 0, 0)
        self.remember_checkbox = QCheckBox("记住账号和密码")
        self.remember_checkbox.setObjectName("LoginRememberCheck")
        option_row.addWidget(self.remember_checkbox)
        option_row.addStretch(1)
        card_lay.addLayout(option_row)

        self.tip_label = QLabel("支持记住登录信息；登录后会根据账号权限进入对应租户。")
        self.tip_label.setObjectName("LoginSubtitle")
        self.tip_label.setWordWrap(True)
        card_lay.addWidget(self.tip_label)

        self.login_button = QPushButton("登录")
        self.login_button.setObjectName("LoginPrimaryButton")
        self.login_button.clicked.connect(self._emit_login)
        card_lay.addWidget(self.login_button)

        center.addWidget(card)
        center.addStretch(1)
        root.addLayout(center)
        root.addStretch(1)

    def set_saved_credentials(self, username: str, password: str, remember: bool) -> None:
        self.username_edit.setText(username)
        self.password_edit.setText(password)
        self.remember_checkbox.setChecked(remember)

    def _label(self, text: str) -> QLabel:
        label = QLabel(text)
        label.setObjectName("LoginFieldLabel")
        return label


    def _toggle_password_visible(self, visible: bool) -> None:
        self.password_edit.setEchoMode(QLineEdit.EchoMode.Normal if visible else QLineEdit.EchoMode.Password)
        self.password_visible_button.setText("隐藏" if visible else "显示")

    def _emit_login(self) -> None:
        self.login_requested.emit(
            self.username_edit.text().strip(),
            self.password_edit.text(),
            self.remember_checkbox.isChecked(),
        )

    def set_loading(self, loading: bool) -> None:
        self.login_button.setEnabled(not loading)
        self.login_button.setText("登录中..." if loading else "登录")
