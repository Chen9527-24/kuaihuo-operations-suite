from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from PySide6.QtCore import Qt
from PySide6.QtGui import QTextCursor
from PySide6.QtWidgets import (
    QApplication,
    QDialog,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSplitter,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QPlainTextEdit,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)


class LogDialog(QDialog):
    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setObjectName("LogDialog")
        self.setWindowTitle("日志与接口请求")
        self.resize(1200, 760)
        self.request_entries: list[dict[str, Any]] = []

        root = QVBoxLayout(self)
        root.setContentsMargins(14, 14, 14, 14)
        root.setSpacing(10)

        header = QHBoxLayout()
        self.title_label = QLabel("日志中心")
        self.title_label.setObjectName("SectionTitle")
        header.addWidget(self.title_label)
        header.addStretch(1)

        self.summary_label = QLabel("0 条请求")
        self.summary_label.setObjectName("TopStatusHint")
        header.addWidget(self.summary_label)

        self.copy_log_btn = QPushButton("复制日志")
        self.copy_log_btn.setObjectName("GhostButton")
        self.copy_log_btn.clicked.connect(self.copy_logs)
        header.addWidget(self.copy_log_btn)

        self.copy_req_btn = QPushButton("复制请求详情")
        self.copy_req_btn.setObjectName("GhostButton")
        self.copy_req_btn.clicked.connect(self.copy_request_detail)
        header.addWidget(self.copy_req_btn)

        self.clear_btn = QPushButton("清空")
        self.clear_btn.setObjectName("GhostButton")
        self.clear_btn.clicked.connect(self.clear_all)
        header.addWidget(self.clear_btn)
        root.addLayout(header)

        self.tabs = QTabWidget()
        root.addWidget(self.tabs, 1)

        self.log_view = QPlainTextEdit()
        self.log_view.setReadOnly(True)
        self.log_view.setLineWrapMode(QPlainTextEdit.LineWrapMode.NoWrap)
        self.log_view.document().setMaximumBlockCount(600)
        self.log_tab_index = self.tabs.addTab(self.log_view, "运行日志")

        req_tab = QWidget()
        req_root = QVBoxLayout(req_tab)
        req_root.setContentsMargins(0, 0, 0, 0)
        req_root.setSpacing(8)

        splitter = QSplitter(Qt.Orientation.Horizontal)
        req_root.addWidget(splitter, 1)

        self.request_table = QTableWidget(0, 5)
        self.request_table.setHorizontalHeaderLabels(["时间", "方法", "状态", "耗时", "路径"])
        self.request_table.horizontalHeader().setStretchLastSection(True)
        self.request_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.request_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.request_table.itemSelectionChanged.connect(self._show_selected_request)
        splitter.addWidget(self.request_table)

        self.request_detail = QTextEdit()
        self.request_detail.setReadOnly(True)
        splitter.addWidget(self.request_detail)
        splitter.setSizes([560, 620])

        self.request_tab = req_tab
        self.request_tab_index = self.tabs.addTab(req_tab, "接口请求")
        self.gui_log_enabled = True
        self.interface_trace_enabled = True

    def set_feature_visibility(self, *, gui_log_enabled: bool = True, interface_trace_enabled: bool = True) -> None:
        self.gui_log_enabled = bool(gui_log_enabled)
        self.interface_trace_enabled = bool(interface_trace_enabled)

        self.tabs.setTabVisible(self.log_tab_index, self.gui_log_enabled)
        self.tabs.setTabVisible(self.request_tab_index, self.interface_trace_enabled)
        self.copy_log_btn.setVisible(self.gui_log_enabled)
        self.copy_req_btn.setVisible(self.interface_trace_enabled)
        self.summary_label.setVisible(self.interface_trace_enabled)
        self.clear_btn.setVisible(self.gui_log_enabled or self.interface_trace_enabled)

        if self.gui_log_enabled:
            self.tabs.setCurrentIndex(self.log_tab_index)
        elif self.interface_trace_enabled:
            self.tabs.setCurrentIndex(self.request_tab_index)

    def set_context(self, title: str, *, window_title: str | None = None) -> None:
        self.title_label.setText(title or "日志中心")
        self.setWindowTitle(window_title or title or "日志与接口请求")


    def copy_logs(self) -> None:
        if not self.gui_log_enabled:
            return
        QApplication.clipboard().setText(self.log_view.toPlainText())

    def copy_request_detail(self) -> None:
        if not self.interface_trace_enabled:
            return
        detail = self.request_detail.toPlainText()
        if not detail and self.request_entries:
            self._show_selected_request()
            detail = self.request_detail.toPlainText()
        QApplication.clipboard().setText(detail)

    def clear_all(self) -> None:
        if self.gui_log_enabled:
            self.log_view.clear()
        if self.interface_trace_enabled:
            self.request_entries.clear()
            self.request_table.setRowCount(0)
            self.request_detail.clear()
            self.summary_label.setText("0 条请求")

    def _truncate_text(self, value: Any, limit: int = 30000) -> str:
        text = str(value or "")
        if len(text) <= limit:
            return text
        return text[:limit] + f"\n... 已截断，原始长度 {len(text)} 字符"

    def set_lines(self, lines: Iterable[str]) -> None:
        if not self.gui_log_enabled:
            self.log_view.clear()
            return
        safe_lines = [self._truncate_text(line, 3000) for line in list(lines)[-600:]]
        self.log_view.setPlainText("\n".join(safe_lines))
        self.log_view.moveCursor(QTextCursor.MoveOperation.End)

    def append_lines(self, lines: Iterable[str]) -> None:
        if not self.gui_log_enabled:
            return
        safe_lines = [self._truncate_text(line, 3000) for line in list(lines)[-120:]]
        text = "\n".join(line for line in safe_lines if line.strip())
        if not text:
            return
        if self.log_view.document().isEmpty():
            self.log_view.appendPlainText(text)
        else:
            self.log_view.appendPlainText(text)
        self.log_view.moveCursor(QTextCursor.MoveOperation.End)

    def set_request_entries(self, entries: list[dict[str, Any]]) -> None:
        if not self.interface_trace_enabled:
            self.request_entries.clear()
            self.request_table.setRowCount(0)
            self.request_detail.clear()
            self.summary_label.setText("0 条请求")
            return
        self.request_entries = list(entries)[-50:]
        self._reload_request_table()

    def append_request_entry(self, entry: dict[str, Any]) -> None:
        self.append_request_entries([entry])

    def append_request_entries(self, entries: Iterable[dict[str, Any]]) -> None:
        if not self.interface_trace_enabled:
            return
        new_entries = [entry for entry in entries if isinstance(entry, dict)]
        if not new_entries:
            return
        self.request_entries.extend(new_entries)
        if len(self.request_entries) > 50:
            self.request_entries = self.request_entries[-50:]
            self._reload_request_table()
            self.request_table.scrollToBottom()
            return
        self.request_table.setUpdatesEnabled(False)
        try:
            for entry in new_entries:
                row = self.request_table.rowCount()
                self.request_table.insertRow(row)
                self._fill_request_row(row, entry)
            self.summary_label.setText(f"{len(self.request_entries)} 条请求")
        finally:
            self.request_table.setUpdatesEnabled(True)
        self.request_table.scrollToBottom()

    def _reload_request_table(self) -> None:
        self.request_table.blockSignals(True)
        self.request_table.setUpdatesEnabled(False)
        try:
            self.request_table.setRowCount(0)
            for entry in self.request_entries:
                row = self.request_table.rowCount()
                self.request_table.insertRow(row)
                self._fill_request_row(row, entry)
            self.summary_label.setText(f"{len(self.request_entries)} 条请求")
            self.request_detail.clear()
        finally:
            self.request_table.setUpdatesEnabled(True)
            self.request_table.blockSignals(False)

    def _fill_request_row(self, row: int, entry: dict[str, Any]) -> None:
        values = [
            str(entry.get("timestamp", "")),
            str(entry.get("method", "")),
            str(entry.get("status_code", "")),
            f"{entry.get('duration_ms', 0)}ms",
            self._truncate_text(entry.get("endpoint", ""), 220),
        ]
        for col, value in enumerate(values):
            item = QTableWidgetItem(str(value))
            if col == 2:
                status_code = int(entry.get("status_code") or 0)
                if 200 <= status_code < 300:
                    item.setForeground(Qt.GlobalColor.darkGreen)
                elif status_code >= 400:
                    item.setForeground(Qt.GlobalColor.red)
            self.request_table.setItem(row, col, item)

    def _show_selected_request(self) -> None:
        row = self.request_table.currentRow()
        if row < 0 or row >= len(self.request_entries):
            return
        entry = self.request_entries[row]
        detail = (
            f"时间: {entry.get('timestamp', '')}\n"
            f"方法: {entry.get('method', '')}\n"
            f"地址: {entry.get('url', '')}\n"
            f"状态码: {entry.get('status_code', '')}\n"
            f"耗时: {entry.get('duration_ms', 0)}ms\n"
            f"\n请求头:\n{entry.get('request_headers', {})}\n"
            f"\n请求参数:\n{entry.get('params') or {}}\n"
            f"\n请求体:\n{self._truncate_text(entry.get('request_body_pretty') or '{}')}\n"
            f"\n响应体:\n{self._truncate_text(entry.get('response_body_pretty') or '')}"
        )
        self.request_detail.setPlainText(detail)
