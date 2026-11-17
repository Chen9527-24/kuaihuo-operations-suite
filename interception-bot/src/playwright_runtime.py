from __future__ import annotations

import os
import queue
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Callable, Optional

from playwright.sync_api import sync_playwright

from .process_utils import no_window_creationflags, no_window_startupinfo
from .runtime_env import apply_runtime_defaults, is_frozen_app

apply_runtime_defaults()

Logger = Optional[Callable[[str], None]]

BRANDED_CHANNELS = {
    "chrome",
    "chrome-beta",
    "chrome-dev",
    "chrome-canary",
    "msedge",
    "msedge-beta",
    "msedge-dev",
    "msedge-canary",
}


SYSTEM_FALLBACK_CHANNELS = ["chrome", "msedge"]


def _env_flag(name: str, default: bool = True) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off", "disabled", "关闭", "否"}


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    try:
        value = int(str(os.environ.get(name, default)).strip())
    except Exception:
        value = default
    return max(value, minimum)


def system_browser_fallback_enabled() -> bool:
    """Whether Playwright may fall back to locally installed Chrome/Edge channels.

    Default is disabled for both source runs and packaged runs.  The robot must use
    the project-managed Playwright Chromium runtime and must not unexpectedly open
    the user's local Chrome/Edge.  Developers can still opt in explicitly with
    ACS_ALLOW_SYSTEM_BROWSER_FALLBACK=1 when diagnosing runtime issues.
    """
    return _env_flag("ACS_ALLOW_SYSTEM_BROWSER_FALLBACK", False)


def playwright_browser_candidates(browser_name: str = "chromium") -> list[str]:
    """Return runtime candidates in priority order.

    The default priority is intentionally Playwright Chromium first.  Chrome/Edge are
    only fallback channels for machines where the Playwright Chromium binary is not
    installed yet or cannot be repaired because the download CDN is unreachable.
    """
    requested = (browser_name or "chromium").strip().lower()
    fallback_enabled = system_browser_fallback_enabled()

    if requested in {"", "auto", "playwright", "chromium"}:
        candidates = ["chromium"]
    elif requested in BRANDED_CHANNELS:
        # Packaged production builds must not open the user's local Chrome/Edge.
        # When system fallback is disabled, treat an old saved "chrome/msedge" setting
        # as Playwright Chromium instead of launching a local browser channel.
        candidates = [requested] if fallback_enabled else ["chromium"]
    else:
        candidates = [requested]

    if fallback_enabled:
        for candidate in ["chromium", *SYSTEM_FALLBACK_CHANNELS]:
            if candidate not in candidates:
                candidates.append(candidate)
    return candidates


def configure_bundled_playwright_browsers() -> None:
    """Prefer browsers bundled into the PyInstaller package when present."""
    if not getattr(sys, "frozen", False):
        return
    if os.environ.get("PLAYWRIGHT_BROWSERS_PATH"):
        return
    internal_root = Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent / "_internal"))
    local_browsers = internal_root / "playwright" / "driver" / "package" / ".local-browsers"
    if local_browsers.exists():
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "0"


def _log(logger: Logger, message: str) -> None:
    if logger:
        logger(message)


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _install_cmd(browser_name: str) -> list[str]:
    if getattr(sys, "frozen", False):
        internal_root = Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent / "_internal"))
        package_dir = internal_root / "playwright" / "driver" / "package"
        node_name = "node.exe" if os.name == "nt" else "node"
        node_path = package_dir / node_name
        cli_path = package_dir / "cli.js"
        if node_path.exists() and cli_path.exists():
            return [str(node_path), str(cli_path), "install", browser_name]
    return [sys.executable, "-m", "playwright", "install", browser_name]


def _auto_install_enabled() -> bool:
    default = "0" if is_frozen_app() else "1"
    value = os.environ.get("ACS_PLAYWRIGHT_AUTO_INSTALL", default).strip().lower()
    return value not in {"0", "false", "no", "off"}


def _terminate_process(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    try:
        process.terminate()
        process.wait(timeout=5)
    except Exception:
        try:
            process.kill()
        except Exception:
            pass


def stream_install_playwright_browser(
    browser_name: str = "chromium",
    logger: Logger = None,
) -> tuple[int, str]:
    configure_bundled_playwright_browsers()
    cmd = _install_cmd(browser_name)
    env = os.environ.copy()
    env.setdefault("PYTHONIOENCODING", "utf-8")
    download_host = os.environ.get("ACS_PLAYWRIGHT_DOWNLOAD_HOST") or os.environ.get("PLAYWRIGHT_DOWNLOAD_HOST")
    if download_host:
        env["PLAYWRIGHT_DOWNLOAD_HOST"] = download_host
    timeout_seconds = _env_int("ACS_PLAYWRIGHT_INSTALL_TIMEOUT_SECONDS", 900, minimum=30)
    captured_lines: list[str] = []

    _log(logger, f"[RUNTIME] Playwright {browser_name}")
    _log(logger, f"[RUNTIME] 命令: {' '.join(cmd)}")
    _log(logger, f"[RUNTIME] 安装超时保护: {timeout_seconds}s")
    if download_host:
        _log(logger, f"[RUNTIME] 使用 Playwright 下载源: {download_host}")

    try:
        process = subprocess.Popen(
            cmd,
            cwd=str(_project_root()),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            creationflags=no_window_creationflags(),
            startupinfo=no_window_startupinfo(),
        )
    except FileNotFoundError as exc:
        _log(logger, f"[RUNTIME][ERROR] 无法启动安装命令: {exc}")
        return 1, str(exc)
    except Exception as exc:
        _log(logger, f"[RUNTIME][ERROR] 启动安装进程失败: {exc}")
        return 1, str(exc)

    output_queue: queue.Queue[str | None] = queue.Queue()

    def reader() -> None:
        try:
            assert process.stdout is not None
            for line in process.stdout:
                output_queue.put(line)
        except Exception as exc:
            output_queue.put(f"[reader-error] {exc}\n")
        finally:
            output_queue.put(None)

    thread = threading.Thread(target=reader, daemon=True)
    thread.start()
    started_at = time.time()
    reader_done = False

    while True:
        if process.poll() is not None and reader_done:
            break
        if time.time() - started_at > timeout_seconds:
            message = (
                f"playwright install {browser_name} timed out after {timeout_seconds}s; "
                "please install the browser once with a working proxy/network, or set ACS_PLAYWRIGHT_DOWNLOAD_HOST."
            )
            captured_lines.append(message)
            _log(logger, f"[RUNTIME][ERROR] {message}")
            _terminate_process(process)
            return 124, "\n".join(captured_lines)
        try:
            line = output_queue.get(timeout=0.25)
        except queue.Empty:
            continue
        if line is None:
            reader_done = True
            continue
        line = line.rstrip()
        if line:
            captured_lines.append(line)
            _log(logger, f"[RUNTIME] {line}")

    if process.stdout is not None:
        try:
            process.stdout.close()
        except Exception:
            pass
    return int(process.returncode or 0), "\n".join(captured_lines)

def _verify_browser_launch(browser_name: str, logger: Logger = None) -> bool:
    configure_bundled_playwright_browsers()
    _log(logger, f"[RUNTIME] 正在验证 {browser_name} 是否可实际启动")
    playwright = sync_playwright().start()
    browser = None
    try:
        launch_kwargs = {"headless": True}
        if browser_name in BRANDED_CHANNELS:
            launch_kwargs["channel"] = browser_name
        browser = playwright.chromium.launch(**launch_kwargs)
        _log(logger, f"[RUNTIME] {browser_name} 启动验证通过")
        return True
    finally:
        if browser is not None:
            browser.close()
        playwright.stop()


def ensure_playwright_browser(
    browser_name: str = "chromium",
    logger: Logger = None,
) -> bool:
    if browser_name in BRANDED_CHANNELS:
        if not system_browser_fallback_enabled():
            _log(logger, f"[RUNTIME] 已禁用系统浏览器通道，{browser_name} 改用 Playwright chromium。")
            browser_name = "chromium"
        else:
            _log(logger, f"[RUNTIME] {browser_name} 使用系统已安装浏览器通道，跳过 playwright install")
            return _verify_browser_launch(browser_name=browser_name, logger=logger)
    try:
        if _verify_browser_launch(browser_name=browser_name, logger=logger):
            return True
    except Exception as exc:
        if not _auto_install_enabled():
            _log(
                logger,
                f"[RUNTIME] {browser_name} is not ready and ACS_PLAYWRIGHT_AUTO_INSTALL=0; skipping playwright install.",
            )
            raise RuntimeError(
                f"Playwright {browser_name} browser is not installed and automatic install is disabled "
                "(ACS_PLAYWRIGHT_AUTO_INSTALL=0)."
            ) from exc
        _log(logger, f"[RUNTIME] {browser_name} 尚未就绪，准备安装/修复：{exc}")
    code, output = stream_install_playwright_browser(browser_name=browser_name, logger=logger)
    if code == 0:
        return _verify_browser_launch(browser_name=browser_name, logger=logger)
    raise RuntimeError(f"playwright install {browser_name} 失败，退出码: {code}")



def ensure_playwright_browser_with_fallback(
    browser_name: str = "chromium",
    logger: Logger = None,
) -> str:
    """Ensure one usable Playwright-controlled browser and return the selected name."""
    candidates = playwright_browser_candidates(browser_name)
    errors: list[str] = []
    requested = (browser_name or "chromium").strip().lower()
    _log(logger, f"[RUNTIME] 浏览器优先级: {' -> '.join(candidates)}")
    for candidate in candidates:
        try:
            if ensure_playwright_browser(candidate, logger=logger):
                if candidate != requested:
                    _log(logger, f"[RUNTIME][WARN] 请求的浏览器 {requested} 不可用，已临时回退到 {candidate}。")
                _log(logger, f"[RUNTIME_BROWSER_SELECTED] {{\"browserName\": \"{candidate}\"}}")
                return candidate
        except Exception as exc:
            errors.append(f"{candidate}: {exc}")
            _log(logger, f"[RUNTIME][WARN] {candidate} 不可用: {exc}")
    joined = " | ".join(errors) if errors else "unknown error"
    raise RuntimeError(f"没有可用的浏览器运行时: {joined}")


def install_playwright_browser(
    browser_name: str = "chromium",
    logger: Logger = None,
) -> bool:
    return ensure_playwright_browser(browser_name=browser_name, logger=logger)
