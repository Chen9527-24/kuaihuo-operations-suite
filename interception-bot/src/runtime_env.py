from __future__ import annotations

import os
import sys
from pathlib import Path


def is_frozen_app() -> bool:
    return bool(getattr(sys, "frozen", False))


def app_root() -> Path:
    if is_frozen_app():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def _parse_dotenv_line(line: str) -> tuple[str, str] | None:
    text = line.strip()
    if not text or text.startswith("#"):
        return None
    if text.lower().startswith("export "):
        text = text[7:].strip()
    if "=" not in text:
        return None
    key, value = text.split("=", 1)
    key = key.strip()
    if not key:
        return None
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        value = value[1:-1]
    return key, value


def load_dotenv(path: Path | None = None, *, override: bool | None = None) -> Path | None:
    """Load simple KEY=VALUE entries from the application .env file.

    Packaged builds rely on .env for runtime policy (no browser download, no local
    Chrome/Edge fallback).  Therefore packaged .env values override inherited shell
    values.  Source runs keep explicit shell variables untouched.
    """
    root = app_root()
    env_path = path or (root / ".env")
    if not env_path.exists():
        return None
    if override is None:
        override = is_frozen_app()
    try:
        lines = env_path.read_text(encoding="utf-8-sig").splitlines()
    except Exception:
        return None
    for line in lines:
        parsed = _parse_dotenv_line(line)
        if not parsed:
            continue
        key, value = parsed
        if override or key not in os.environ:
            os.environ[key] = value
    return env_path


def apply_runtime_defaults() -> None:
    """Apply production-safe runtime defaults.

    In packaged exe mode, robot subprocesses must never open cmd windows, download
    Playwright browsers, or fall back to the user's local Chrome/Edge unless the
    operator explicitly changes .env.  Source mode keeps the old developer-friendly
    defaults so local debugging is not broken.
    """
    load_dotenv(override=is_frozen_app())
    if is_frozen_app():
        defaults = {
            "ACS_PLAYWRIGHT_AUTO_INSTALL": "0",
            "ACS_ALLOW_SYSTEM_BROWSER_FALLBACK": "0",
            "ACS_SPEECH_HEADLESS": "1",
            "ACS_SPEECH_RETRY_VISIBLE_ON_FAIL": "0",
            "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD": "1",
            "PYTHONUTF8": "1",
            "PYTHONIOENCODING": "utf-8",
        }
        for key, value in defaults.items():
            os.environ.setdefault(key, value)
    else:
        # Source runs should match the product runtime by default: use the
        # project-managed Playwright Chromium and never fall back to local
        # Chrome/Edge unless a developer explicitly opts in.
        os.environ.setdefault("ACS_ALLOW_SYSTEM_BROWSER_FALLBACK", "0")
        os.environ.setdefault("ACS_SPEECH_RETRY_VISIBLE_ON_FAIL", "0")
        os.environ.setdefault("ACS_SPEECH_HEADLESS", "1")
        os.environ.setdefault("PYTHONUTF8", "1")
        os.environ.setdefault("PYTHONIOENCODING", "utf-8")


def runtime_env_for_child(base: dict[str, str] | None = None) -> dict[str, str]:
    """Return a child-process environment consistent with current runtime mode."""
    apply_runtime_defaults()
    env = dict(base or os.environ.copy())
    env.setdefault("ACS_ALLOW_SYSTEM_BROWSER_FALLBACK", "0")
    env.setdefault("ACS_SPEECH_HEADLESS", "1")
    env.setdefault("ACS_SPEECH_RETRY_VISIBLE_ON_FAIL", "0")
    if is_frozen_app():
        env.setdefault("ACS_PLAYWRIGHT_AUTO_INSTALL", "0")
        env.setdefault("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD", "1")
        # Installation is disabled in packaged mode; inherited mirror variables only
        # make diagnostics confusing and can reintroduce CDN/cmd popup behavior if a
        # future path accidentally attempts installation.
        if env.get("ACS_PLAYWRIGHT_AUTO_INSTALL", "0").strip().lower() in {"0", "false", "no", "off"}:
            env.pop("PLAYWRIGHT_DOWNLOAD_HOST", None)
            env.pop("ACS_PLAYWRIGHT_DOWNLOAD_HOST", None)
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    return env
