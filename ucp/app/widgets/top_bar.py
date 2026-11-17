from __future__ import annotations

from PySide6.QtCore import Signal
from PySide6.QtWidgets import QButtonGroup, QFrame, QHBoxLayout, QLabel, QPushButton, QVBoxLayout

from app.models import PLATFORM_NAMES


class TopBar(QFrame):
    platform_changed = Signal(str)
    logout_clicked = Signal()

    def __init__(self) -> None:
        super().__init__()
        self.setObjectName("TopBar")

        root = QHBoxLayout(self)
        root.setContentsMargins(16, 14, 16, 14)
        root.setSpacing(12)

        self.logo = QLabel("UC")
        self.logo.setObjectName("TopBarLogo")
        root.addWidget(self.logo)

        self.platform_group = QButtonGroup(self)
        self.platform_group.setExclusive(True)
        self.platform_buttons: dict[str, QPushButton] = {}

        for code in ("DOUYIN", "KUAISHOU", "XIAOHONGSHU", "WECHAT_VIDEO"):
            label = PLATFORM_NAMES.get(code, code)
            implemented = code in {"DOUYIN", "WECHAT_VIDEO"}
            btn = QPushButton(label if implemented else f"{label}（未实现）")
            if not implemented:
                btn.setEnabled(False)
                btn.setToolTip("当前自动回复客户端仅实现抖音和微信视频号")
            btn.setObjectName("TopPlatformButton")
            btn.setCheckable(True)
            btn.clicked.connect(lambda checked=False, platform=code: self.platform_changed.emit(platform))
            self.platform_group.addButton(btn)
            self.platform_buttons[code] = btn
            root.addWidget(btn)

        self.platform_buttons["DOUYIN"].setChecked(True)

        root.addSpacing(8)

        self.page_title = QLabel("未登录")
        self.page_title.setObjectName("TopPageTitle")
        root.addWidget(self.page_title, 1)

        right_box = QVBoxLayout()
        right_box.setSpacing(2)
        right_box.setContentsMargins(0, 0, 0, 0)

        self.tenant_hint = QLabel("请先登录并选择租户")
        self.tenant_hint.setObjectName("TopStatusHint")
        right_box.addWidget(self.tenant_hint)

        self.runtime_hint = QLabel("每个机器人卡片可单独查看日志")
        self.runtime_hint.setObjectName("TopStatusHint")
        right_box.addWidget(self.runtime_hint)

        root.addLayout(right_box)

        self.logout_button = QPushButton("退出登录")
        self.logout_button.setObjectName("GhostButton")
        self.logout_button.setToolTip("退出当前 UCP 登录账号；不会清理平台账号授权")
        self.logout_button.clicked.connect(self.logout_clicked.emit)
        root.addWidget(self.logout_button)

    def set_platform(self, platform: str) -> None:
        button = self.platform_buttons.get(platform)
        if button:
            button.setChecked(True)

    def set_session_info(self, *, username: str, tenant_name: str) -> None:
        self.tenant_hint.setText(f"当前租户：{tenant_name}    登录账号：{username}")

    def set_runtime_hint(self, text: str) -> None:
        self.runtime_hint.setText(text)
