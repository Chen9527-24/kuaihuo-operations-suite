from __future__ import annotations

import sys
from pathlib import Path

from PySide6.QtWidgets import QApplication

from app.main_window import MainWindow


def _resolve_project_root() -> Path:
    # 开发态使用源码根目录；PyInstaller 打包后使用 exe 所在目录。
    # 这样 .env、config、profiles、logs 等运行期文件都落在 exe 旁边，
    # 不会写入临时解包目录，也方便按不同环境替换 Core Nexus 地址。
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def main() -> None:
    app = QApplication(sys.argv)
    project_root = _resolve_project_root()
    window = MainWindow(project_root)
    app.aboutToQuit.connect(window._stop_all_local_robots_for_shutdown)
    window.showMaximized()
    sys.exit(app.exec())
