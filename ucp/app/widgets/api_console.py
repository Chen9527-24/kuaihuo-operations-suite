from __future__ import annotations

import json
from typing import Any

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QPlainTextEdit,
    QPushButton,
    QSplitter,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
)

from app.services.http_client import RequestLogEntry


class ApiConsolePanel(QFrame):
    """类似浏览器 Network 面板的接口请求查看器。"""

    def __init__(self) -> None:
        super().__init__()
        self.setObjectName("ApiConsolePanel")
        self.entries: list[RequestLogEntry] = []

        root = QVBoxLayout(self)
        root.setContentsMargins(12, 12, 12, 12)
        root.setSpacing(10)

        header = QHBoxLayout()
        title = QLabel("接口请求控制台")
        title.setObjectName("SectionTitle")
        header.addWidget(title)
        header.addStretch(1)
        self.summary_label = QLabel("0 条请求")
        self.summary_label.setObjectName("ConsoleSummary")
        header.addWidget(self.summary_label)
        clear_btn = QPushButton("清空")
        clear_btn.setObjectName("GhostButton")
        clear_btn.clicked.connect(self.clear)
        header.addWidget(clear_btn)
        root.addLayout(header)

        splitter = QSplitter(Qt.Orientation.Horizontal)
        root.addWidget(splitter, 1)

        self.table = QTableWidget(0, 5)
        self.table.setObjectName("ApiConsoleTable")
        self.table.setHorizontalHeaderLabels(["时间", "方法", "状态", "耗时", "路径"])
        self.table.verticalHeader().setVisible(False)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table.itemSelectionChanged.connect(self._show_selected_detail)
        header_view = self.table.horizontalHeader()
        header_view.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header_view.setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        header_view.setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        header_view.setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        header_view.setSectionResizeMode(4, QHeaderView.ResizeMode.Stretch)
        splitter.addWidget(self.table)

        self.detail = QPlainTextEdit()
        self.detail.setObjectName("ApiConsoleDetail")
        self.detail.setReadOnly(True)
        splitter.addWidget(self.detail)
        splitter.setSizes([650, 520])

    def add_entry(self, entry: RequestLogEntry) -> None:
        self.entries.append(entry)
        if len(self.entries) > 1000:
            self.entries = self.entries[-1000:]
            self._rebuild_table()
            return
        row = self.table.rowCount()
        self.table.insertRow(row)
        self._fill_row(row, entry, len(self.entries) - 1)
        self.summary_label.setText(f"{len(self.entries)} 条请求")
        self.table.scrollToBottom()

    def clear(self) -> None:
        self.entries.clear()
        self.table.setRowCount(0)
        self.detail.clear()
        self.summary_label.setText("0 条请求")

    def _rebuild_table(self) -> None:
        self.table.setRowCount(0)
        for index, entry in enumerate(self.entries):
            row = self.table.rowCount()
            self.table.insertRow(row)
            self._fill_row(row, entry, index)
        self.summary_label.setText(f"{len(self.entries)} 条请求")

    def _fill_row(self, row: int, entry: RequestLogEntry, index: int) -> None:
        status_text = str(entry.status) if entry.status is not None else "ERR"
        values = [entry.timestamp, entry.method, status_text, f"{entry.duration_ms}ms", entry.path]
        for col, value in enumerate(values):
            item = QTableWidgetItem(value)
            item.setData(Qt.ItemDataRole.UserRole, index)
            if col == 2:
                ok = entry.status is not None and 200 <= entry.status < 400 and not entry.error
                item.setForeground(Qt.GlobalColor.darkGreen if ok else Qt.GlobalColor.red)
            self.table.setItem(row, col, item)

    def _show_selected_detail(self) -> None:
        items = self.table.selectedItems()
        if not items:
            return
        index = int(items[0].data(Qt.ItemDataRole.UserRole))
        if index < 0 or index >= len(self.entries):
            return
        entry = self.entries[index]
        detail_payload = {
            "request": {
                "time": entry.timestamp,
                "method": entry.method,
                "url": entry.url,
                "headers": entry.request_headers,
                "body": entry.request_body,
            },
            "response": {
                "status": entry.status,
                "durationMs": entry.duration_ms,
                "body": entry.response_body,
                "error": entry.error,
            },
        }
        self.detail.setPlainText(self._format_json(detail_payload))

    @staticmethod
    def _format_json(value: Any) -> str:
        try:
            return json.dumps(value, ensure_ascii=False, indent=2)
        except Exception:
            return str(value)
