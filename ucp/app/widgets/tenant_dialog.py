from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QDialog, QDialogButtonBox, QLabel, QListWidget, QListWidgetItem, QVBoxLayout

from app.services.auth_service import TenantOption


class TenantSelectDialog(QDialog):
    def __init__(self, tenants: list[TenantOption]) -> None:
        super().__init__()
        self.setObjectName("TenantSelectDialog")
        self.setWindowTitle("选择租户")
        self.setModal(True)
        self.setMinimumWidth(560)
        self.tenants = tenants

        root = QVBoxLayout(self)
        root.setContentsMargins(22, 22, 22, 22)
        root.setSpacing(14)

        title = QLabel("请选择本次运行使用的租户")
        title.setObjectName("DialogTitle")
        root.addWidget(title)

        tip = QLabel("后续接口请求会自动携带 X-Tenant-Id 请求头。")
        tip.setObjectName("DialogTip")
        root.addWidget(tip)

        self.list_widget = QListWidget()
        self.list_widget.setMinimumHeight(220)
        self.list_widget.setWordWrap(True)
        for tenant in tenants:
            suffix = "  · 默认" if tenant.is_default else ""
            code_text = f" ({tenant.tenant_code})" if tenant.tenant_code else ""
            item = QListWidgetItem(f"{tenant.tenant_name}{code_text}{suffix}")
            item.setData(Qt.ItemDataRole.UserRole, tenant.tenant_id)
            self.list_widget.addItem(item)
            if tenant.is_default:
                item.setSelected(True)
        if tenants and not self.list_widget.selectedItems():
            self.list_widget.setCurrentRow(0)
        root.addWidget(self.list_widget, 1)

        self.buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        self.buttons.button(QDialogButtonBox.StandardButton.Ok).setText("确认")
        self.buttons.button(QDialogButtonBox.StandardButton.Cancel).setText("返回登录")
        self.buttons.accepted.connect(self._validate_and_accept)
        self.buttons.rejected.connect(self.reject)
        root.addWidget(self.buttons)

    def selected_tenant_id(self) -> str:
        items = self.list_widget.selectedItems()
        if not items:
            return ""
        return str(items[0].data(Qt.ItemDataRole.UserRole) or "")

    def _validate_and_accept(self) -> None:
        if self.selected_tenant_id():
            self.accept()
