from __future__ import annotations

import io
import os
import sys


def _configure_utf8_stdio() -> None:
    """Force UTF-8 stdout/stderr for GUI child processes and packaged exe.

    Windows packaged processes may still default stdout/stderr to the system
    ANSI code page, even when the parent GUI passes UTF-8 environment flags.
    Some captured titles/comments contain emoji or non-GBK characters; printing
    them through a GBK stream can raise UnicodeEncodeError and abort the robot
    run. Keep the output UTF-8 and replace only unencodable edge cases.
    """
    os.environ.setdefault("PYTHONUTF8", "1")
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    for name in ("stdout", "stderr"):
        stream = getattr(sys, name, None)
        if stream is None:
            continue
        try:
            stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
            continue
        except Exception:
            pass
        buffer = getattr(stream, "buffer", None)
        if buffer is None:
            continue
        try:
            setattr(sys, name, io.TextIOWrapper(buffer, encoding="utf-8", errors="replace", line_buffering=True))
        except Exception:
            pass


_configure_utf8_stdio()

from src.runtime_env import apply_runtime_defaults

apply_runtime_defaults()

from src.cli import main as cli_main


if __name__ == '__main__':
    if len(sys.argv) == 1 or sys.argv[1] == 'gui':
        try:
            from src.gui_app import launch_gui
        except ModuleNotFoundError as exc:
            if exc.name == 'PySide6':
                print('[ERR] 当前环境缺少 PySide6，无法启动 GUI。请安装 requirements.txt，或使用 CLI 命令运行。')
                raise SystemExit(1)
            raise
        raise SystemExit(launch_gui())
    raise SystemExit(cli_main())
