from __future__ import annotations

from PySide6.QtCore import Signal
from PySide6.QtWidgets import QButtonGroup, QFrame, QLabel, QPushButton, QVBoxLayout, QWidget


PLATFORMS = [
    ("douyin", "抖音", "D"),
    ("kuaishou", "快手", "K"),
    ("xiaohongshu", "小红书", "X"),
    ("channels", "视频号", "V"),
]


class PlatformSidebar(QFrame):
    platform_changed = Signal(str)

    def __init__(self) -> None:
        super().__init__()
        self.setObjectName("PlatformSidebar")
        self.setFixedWidth(82)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 14, 10, 14)
        layout.setSpacing(12)

        logo = QLabel("MF")
        logo.setObjectName("SidebarLogo")
        logo.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(logo)

        self.group = QButtonGroup(self)
        self.group.setExclusive(True)
        self.group.buttonClicked.connect(self._emit_platform)

        for key, label, short in PLATFORMS:
            btn = QPushButton(f"{short}\n{label}")
            implemented = key in {"douyin", "channels"}
            if not implemented:
                btn.setText(f"{short}\n{label}\n未实现")
                btn.setToolTip("当前展示版尚未实现该平台")
                btn.setEnabled(False)
            btn.setCheckable(True)
            btn.setProperty("platform", key)
            btn.setObjectName("PlatformButton")
            btn.setFixedHeight(72)
            layout.addWidget(btn)
            self.group.addButton(btn)
            if key == "douyin":
                btn.setChecked(True)

        layout.addStretch(1)
        settings = QPushButton("⚙")
        settings.setObjectName("SidebarSettings")
        settings.setEnabled(False)
        layout.addWidget(settings)

    def _emit_platform(self, button: QPushButton) -> None:
        self.platform_changed.emit(button.property("platform"))


from PySide6.QtCore import Qt
