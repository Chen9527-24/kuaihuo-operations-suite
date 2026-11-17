from __future__ import annotations

from PySide6.QtCore import QSize, Qt, Signal
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from app.models import TenantOption


class TenantCard(QFrame):
    def __init__(self, tenant: TenantOption) -> None:
        super().__init__()
        self.setObjectName("TenantOptionCard")
        self.setMinimumHeight(82)
        self.setToolTip(f"{tenant.tenant_name}\n{tenant.tenant_code or tenant.tenant_id}")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 12, 16, 12)
        layout.setSpacing(6)

        top = QHBoxLayout()
        top.setContentsMargins(0, 0, 0, 0)
        top.setSpacing(8)
        name = QLabel(tenant.tenant_name)
        name.setObjectName("TenantName")
        name.setWordWrap(True)
        name.setMinimumHeight(22)
        top.addWidget(name, 1)
        if tenant.is_default:
            badge = QLabel("默认")
            badge.setObjectName("TenantBadge")
            badge.setAlignment(Qt.AlignmentFlag.AlignCenter)
            top.addWidget(badge, 0, Qt.AlignmentFlag.AlignTop)

        self.selected_badge = QLabel("已选")
        self.selected_badge.setObjectName("TenantSelectedBadge")
        self.selected_badge.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.selected_badge.setVisible(False)
        top.addWidget(self.selected_badge, 0, Qt.AlignmentFlag.AlignTop)
        layout.addLayout(top)

        code = QLabel(tenant.tenant_code or tenant.tenant_id)
        code.setObjectName("TenantCode")
        code.setWordWrap(True)
        code.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        layout.addWidget(code)

    def set_selected(self, selected: bool) -> None:
        self.setProperty("selected", bool(selected))
        self.selected_badge.setVisible(bool(selected))
        self.style().unpolish(self)
        self.style().polish(self)
        self.update()


class TenantSelectPage(QWidget):
    tenant_confirmed = Signal(str)
    back_requested = Signal()

    def __init__(self) -> None:
        super().__init__()
        self.tenants: list[TenantOption] = []

        root = QVBoxLayout(self)
        root.setContentsMargins(28, 28, 28, 28)
        root.addStretch(1)

        center = QHBoxLayout()
        center.addStretch(1)

        card = QFrame()
        card.setObjectName("TenantCard")
        # 多租户名称/编码可能较长，登录后的租户选择页不能依赖内容自动撑宽；
        # 固定一个更安全的宽度区间，避免 QListWidget item 被压窄导致文字被遮挡。
        card.setMinimumWidth(520)
        card.setMaximumWidth(640)
        card_lay = QVBoxLayout(card)
        card_lay.setContentsMargins(38, 36, 38, 36)
        card_lay.setSpacing(16)

        logo = QLabel("租户")
        logo.setObjectName("TenantLogo")
        logo.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_lay.addWidget(logo, 0, Qt.AlignmentFlag.AlignHCenter)

        title = QLabel("选择工作空间")
        title.setObjectName("LoginTitle")
        title.setAlignment(Qt.AlignmentFlag.AlignHCenter)
        card_lay.addWidget(title)

        subtitle = QLabel("当前账号可进入多个租户，请选择本次操作的工作空间。")
        subtitle.setObjectName("LoginSubtitle")
        subtitle.setWordWrap(True)
        subtitle.setAlignment(Qt.AlignmentFlag.AlignHCenter)
        card_lay.addWidget(subtitle)

        self.list_widget = QListWidget()
        self.list_widget.setObjectName("TenantListWidget")
        self.list_widget.setMinimumWidth(430)
        self.list_widget.setMinimumHeight(250)
        self.list_widget.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.list_widget.setTextElideMode(Qt.TextElideMode.ElideNone)
        self.list_widget.itemDoubleClicked.connect(lambda _item: self._emit_selected())
        self.list_widget.currentItemChanged.connect(lambda _current, _previous: self._refresh_selected_badges())
        card_lay.addWidget(self.list_widget, 1)

        button_row = QHBoxLayout()
        button_row.setSpacing(12)
        back_btn = QPushButton("返回登录")
        back_btn.setObjectName("GhostButton")
        back_btn.clicked.connect(self.back_requested.emit)
        button_row.addWidget(back_btn)

        button_row.addStretch(1)
        self.confirm_btn = QPushButton("进入工作台")
        self.confirm_btn.setObjectName("PrimaryActionButton")
        self.confirm_btn.clicked.connect(self._emit_selected)
        button_row.addWidget(self.confirm_btn)
        card_lay.addLayout(button_row)

        center.addWidget(card)
        center.addStretch(1)
        root.addLayout(center)
        root.addStretch(1)

    def set_tenants(self, tenants: list[TenantOption]) -> None:
        self.tenants = list(tenants)
        self.list_widget.clear()
        for tenant in tenants:
            item = QListWidgetItem()
            item.setData(Qt.ItemDataRole.UserRole, tenant.tenant_id)
            widget = TenantCard(tenant)
            hint = widget.sizeHint()
            item.setSizeHint(QSize(max(hint.width(), 390), max(hint.height(), 88)))
            self.list_widget.addItem(item)
            self.list_widget.setItemWidget(item, widget)
        if tenants:
            default_idx = next((i for i, item in enumerate(tenants) if item.is_default), 0)
            self.list_widget.setCurrentRow(default_idx)
        self._refresh_selected_badges()

    def _refresh_selected_badges(self) -> None:
        current = self.list_widget.currentItem()
        for row in range(self.list_widget.count()):
            item = self.list_widget.item(row)
            widget = self.list_widget.itemWidget(item)
            if hasattr(widget, "set_selected"):
                widget.set_selected(item is current)

    def _emit_selected(self) -> None:
        item = self.list_widget.currentItem()
        if not item:
            QMessageBox.warning(self, "请选择租户", "租户为必选项，请先选择一个工作空间。")
            return
        tenant_id = item.data(Qt.ItemDataRole.UserRole)
        if not tenant_id:
            QMessageBox.warning(self, "请选择租户", "租户为必选项，请先选择一个工作空间。")
            return
        self.tenant_confirmed.emit(str(tenant_id))
