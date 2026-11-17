from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from playwright.sync_api import BrowserContext, sync_playwright

from .playwright_runtime import configure_bundled_playwright_browsers, ensure_playwright_browser, playwright_browser_candidates
from .runtime_env import apply_runtime_defaults, is_frozen_app

apply_runtime_defaults()


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


def _auto_install_enabled() -> bool:
    default = "0" if is_frozen_app() else "1"
    value = os.environ.get("ACS_PLAYWRIGHT_AUTO_INSTALL", default).strip().lower()
    return value not in {"0", "false", "no", "off"}


class BrowserSession:
    def __init__(
        self,
        profile_dir: Path,
        headless: bool = False,
        slow_mo_ms: int = 0,
        browser_name: str = "chromium",
        auto_install_browser: bool = True,
        storage_state_path: Optional[Path] = None,
    ):
        self.profile_dir = profile_dir
        self.headless = headless
        self.slow_mo_ms = slow_mo_ms
        self.browser_name = browser_name or "chromium"
        self.auto_install_browser = auto_install_browser and _auto_install_enabled()
        self.storage_state_path = storage_state_path
        self._playwright = None
        self.context: Optional[BrowserContext] = None
        self._old_tmp_env: dict[str, str | None] = {}
        self._runtime_tmp_dir: Optional[Path] = None

    def __enter__(self) -> BrowserContext:
        configure_bundled_playwright_browsers()
        self.profile_dir = self.profile_dir.resolve()
        self.profile_dir.mkdir(parents=True, exist_ok=True)
        # Playwright 的 Node driver 会依赖系统临时目录创建运行期 artifacts。
        # 在部分 Windows 机器上，TEMP/TMP 指向的目录不存在时，launch_persistent_context
        # 会直接报 `ENOENT: no such file or directory, mkdir`，且错误里不带具体路径。
        # 这里为每个 profile 固定一个项目内临时目录，并在启动 driver 前注入环境变量，
        # 避免系统临时目录异常或账号名特殊字符导致 Chromium 启动后立即退出。
        self._runtime_tmp_dir = (self.profile_dir.parent / "_playwright_tmp").resolve()
        self._runtime_tmp_dir.mkdir(parents=True, exist_ok=True)
        self._old_tmp_env = {key: os.environ.get(key) for key in ("TEMP", "TMP", "TMPDIR")}
        for key in self._old_tmp_env:
            os.environ[key] = str(self._runtime_tmp_dir)
        errors = []
        if not self.auto_install_browser:
            print("[RUNTIME] ACS_PLAYWRIGHT_AUTO_INSTALL=0; skip playwright install and use existing browser only.")
        for candidate in self._browser_candidates():
            try:
                if self.auto_install_browser:
                    ensure_playwright_browser(candidate)
                if self._playwright is None:
                    self._playwright = sync_playwright().start()
                self.context = self._launch_context(candidate)
                self._apply_storage_state(self.context)
                mode_label = "后台无界面" if self.headless else "可见窗口"
                if candidate != self.browser_name:
                    print(f"[WARN] 浏览器运行时已从 {self.browser_name} 回退为 {candidate}，模式={mode_label}")
                else:
                    print(f"[INFO] 浏览器运行时: {candidate}，模式={mode_label}")
                return self.context
            except Exception as exc:
                errors.append(f"{candidate}: {exc}")
                try:
                    if self.context:
                        self.context.close()
                except Exception:
                    pass
                self.context = None
                try:
                    if self._playwright:
                        self._playwright.stop()
                except Exception:
                    pass
                self._playwright = None

        joined = " | ".join(errors) if errors else "unknown error"
        self._restore_tmp_env()
        raise RuntimeError(f"浏览器运行时启动失败: {joined}")


    def _apply_storage_state(self, context: BrowserContext) -> None:
        if not self.storage_state_path:
            return
        path = Path(self.storage_state_path)
        if not path.exists():
            print(f"[WARN] 登录态文件不存在，已跳过注入: {path}")
            return
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"[WARN] 登录态文件读取失败，已跳过注入: {exc}")
            return

        raw_cookies = data.get("cookies") if isinstance(data, dict) else None
        raw_origins = data.get("origins") if isinstance(data, dict) else None
        raw_cookie_list = raw_cookies if isinstance(raw_cookies, list) else []
        cookie_count = self._apply_storage_cookies(context, raw_cookie_list)
        local_storage_count = self._apply_local_storage(context, raw_origins if isinstance(raw_origins, list) else [])
        if cookie_count or local_storage_count:
            print(f"[AUTH] 已从右侧工作区注入登录态：Cookie={cookie_count} 个，localStorage={local_storage_count} 项")
            self._warn_if_douyin_state_has_no_strong_auth(raw_cookie_list)
        else:
            print(f"[WARN] 登录态文件中没有可注入的 Cookie/localStorage: {path}")

    def _warn_if_douyin_state_has_no_strong_auth(self, raw_cookies: list) -> None:
        try:
            names = {str(item.get("name") or "") for item in raw_cookies if isinstance(item, dict) and "douyin.com" in str(item.get("domain") or "").lower()}
            if not names:
                return
            strong = {
                "sessionid", "sessionid_ss", "sid_guard", "sid_tt", "uid_tt", "uid_tt_ss",
                "passport_auth_status", "passport_auth_status_ss", "sid_ucp_v1", "ssid_ucp_v1",
                "n_mh",
            }
            if not (names & strong):
                sample = ", ".join(sorted(name for name in names if name)[:12])
                print(f"[AUTH] WARN 当前右侧工作区导出的抖音 Cookie 中没有强登录凭证，仅检测到：{sample or '-'}；主动私信会触发登录弹窗。")
        except Exception:
            pass

    def _apply_storage_cookies(self, context: BrowserContext, raw_cookies: list) -> int:
        cookies = []
        for item in raw_cookies:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            value = str(item.get("value") or "")
            domain = str(item.get("domain") or "").strip()
            url = str(item.get("url") or "").strip()
            if not name or (not domain and not url):
                continue
            cookie = {
                "name": name,
                "value": value,
                "path": str(item.get("path") or "/"),
                "httpOnly": bool(item.get("httpOnly", False)),
                "secure": bool(item.get("secure", False)),
            }
            if domain:
                cookie["domain"] = domain
            else:
                cookie["url"] = url
            expires = item.get("expires", item.get("expirationDate", -1))
            try:
                expires = int(expires)
            except Exception:
                expires = -1
            cookie["expires"] = expires if expires > 0 else -1
            same_site = str(item.get("sameSite") or "").strip()
            if same_site in {"Strict", "Lax", "None"}:
                cookie["sameSite"] = same_site
            cookies.append(cookie)

        if not cookies:
            return 0
        try:
            context.add_cookies(cookies)
            return len(cookies)
        except Exception as exc:
            print(f"[WARN] 登录态 Cookie 注入失败，后续采集可能仍处于未登录状态: {exc}")
            return 0

    def _apply_local_storage(self, context: BrowserContext, raw_origins: list) -> int:
        origins = []
        total = 0
        for origin_item in raw_origins:
            if not isinstance(origin_item, dict):
                continue
            origin = str(origin_item.get("origin") or "").strip().rstrip("/")
            items = origin_item.get("localStorage")
            if not origin or not isinstance(items, list):
                continue
            cleaned = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name") or "")
                if not name:
                    continue
                cleaned.append({"name": name, "value": str(item.get("value") or "")})
            if cleaned:
                origins.append({"origin": origin, "items": cleaned})
                total += len(cleaned)
        if not origins:
            return 0
        try:
            context.add_init_script(
                """
                (origins) => {
                  try {
                    const matched = origins.find(item => item.origin === window.location.origin);
                    if (!matched || !Array.isArray(matched.items)) return;
                    for (const entry of matched.items) {
                      if (entry && entry.name) window.localStorage.setItem(entry.name, entry.value || '');
                    }
                  } catch (e) {}
                }
                """,
                origins,
            )
            return total
        except Exception as exc:
            print(f"[WARN] 登录态 localStorage 注入失败，后续采集可能仍处于未登录状态: {exc}")
            return 0

    def _browser_candidates(self) -> list[str]:
        return playwright_browser_candidates(self.browser_name or "chromium")

    def _launch_context(self, browser_name: str) -> BrowserContext:
        launch_kwargs = dict(
            user_data_dir=str(self.profile_dir),
            headless=self.headless,
            slow_mo=self.slow_mo_ms,
            viewport={"width": 1440, "height": 1080},
            locale="zh-CN",
            timezone_id="Asia/Shanghai",
            downloads_path=str((self.profile_dir / "downloads").resolve()),
            traces_dir=str((self.profile_dir / "traces").resolve()),
            args=[
                "--lang=zh-CN",
                "--mute-audio",
                "--no-first-run",
                "--no-default-browser-check",
                "--autoplay-policy=no-user-gesture-required",
                "--disable-background-media-suspend",
                "--disable-renderer-backgrounding",
                "--disable-features=CalculateNativeWinOcclusion",
            ],
        )
        if browser_name in BRANDED_CHANNELS:
            launch_kwargs["channel"] = browser_name
        return self._playwright.chromium.launch_persistent_context(**launch_kwargs)

    def _restore_tmp_env(self) -> None:
        for key, old_value in self._old_tmp_env.items():
            if old_value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old_value
        self._old_tmp_env = {}

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            if self.context:
                self.context.close()
        except Exception:
            pass

        try:
            if self._playwright:
                self._playwright.stop()
        except Exception:
            pass

        self._restore_tmp_env()
