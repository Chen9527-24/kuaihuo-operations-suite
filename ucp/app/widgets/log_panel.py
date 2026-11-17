from __future__ import annotations

from collections.abc import Iterable

from PySide6.QtCore import QSignalBlocker
from PySide6.QtGui import QTextCursor
from PySide6.QtWidgets import QFrame, QHBoxLayout, QLabel, QPlainTextEdit, QPushButton, QVBoxLayout


class LogPanel(QFrame):
    def __init__(self) -> None:
        super().__init__()
        self.setObjectName("LogPanel")
        root = QVBoxLayout(self)
        root.setContentsMargins(10, 8, 10, 8)
        root.setSpacing(8)

        top = QHBoxLayout()
        title = QLabel("实时日志")
        title.setObjectName("SectionTitle")
        top.addWidget(title)
        top.addStretch(1)
        self.copy_btn = QPushButton("复制")
        self.clear_btn = QPushButton("清空")
        top.addWidget(self.copy_btn)
        top.addWidget(self.clear_btn)
        root.addLayout(top)

        self.text = QPlainTextEdit()
        self.text.setReadOnly(True)
        self.text.setLineWrapMode(QPlainTextEdit.LineWrapMode.NoWrap)
        self.text.document().setMaximumBlockCount(600)
        root.addWidget(self.text, 1)

        self.clear_btn.clicked.connect(self.text.clear)
        self.copy_btn.clicked.connect(self._copy)

    def append_lines(self, lines: Iterable[str]) -> None:
        chunk = "\n".join(str(line) for line in lines if str(line).strip())
        if not chunk:
            return
        cursor = self.text.textCursor()
        cursor.movePosition(QTextCursor.MoveOperation.End)
        if self.text.document().characterCount() > 1:
            cursor.insertText("\n")
        cursor.insertText(chunk)
        self.text.setTextCursor(cursor)
        self.text.ensureCursorVisible()

    def set_lines(self, lines: Iterable[str]) -> None:
        content = "\n".join(str(line) for line in lines)
        blocker = QSignalBlocker(self.text)
        self.text.setPlainText(content)
        del blocker
        cursor = self.text.textCursor()
        cursor.movePosition(QTextCursor.MoveOperation.End)
        self.text.setTextCursor(cursor)

    def _copy(self) -> None:
        self.text.selectAll()
        self.text.copy()
        cursor = self.text.textCursor()
        cursor.movePosition(QTextCursor.MoveOperation.End)
        self.text.setTextCursor(cursor)
