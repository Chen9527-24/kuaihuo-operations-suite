from __future__ import annotations

import json
import shutil
import threading
import time
from typing import Any

from PySide6.QtCore import QTimer, QUrl, Qt
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile, QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QVBoxLayout, QWidget

from app.platforms.douyin.common.js_scripts import build_click_text_script


_DOUYIN_SHARED_PROFILE_BY_PATH: dict[str, dict[str, Any]] = {}
_DOUYIN_SHARED_PROFILE_LOCK = threading.RLock()


class SessionControllerViewMixin:
    def _profile_activity_mtime(self, path) -> float:
            latest = 0.0
            try:
                latest = max(latest, path.stat().st_mtime)
            except Exception:
                pass
            markers = ("Cookies", "Network/Cookies", "Local Storage", "IndexedDB", "Session Storage", "Local State")
            for marker in markers:
                target = path / marker
                try:
                    if target.is_file():
                        latest = max(latest, target.stat().st_mtime)
                    elif target.exists():
                        for item in target.rglob("*"):
                            if item.is_file():
                                try:
                                    latest = max(latest, item.stat().st_mtime)
                                except Exception:
                                    pass
                except Exception:
                    pass
            return latest

    def _profile_has_authish_data(self, path) -> bool:
            if not path.exists():
                return False
            for marker in ("Cookies", "Network/Cookies", "Local Storage", "IndexedDB", "Session Storage", "Local State"):
                target = path / marker
                try:
                    if target.is_file() and target.stat().st_size > 0:
                        return True
                    if target.is_dir() and any(target.iterdir()):
                        return True
                except Exception:
                    pass
            return False

    def _candidate_legacy_douyin_profile_dirs(self, profile_dir) -> list:
            platform_dir = self.profile_root / str(self.account.platform).lower()
            raw_keys = [
                self.account.name,
                self.account.auth_uid,
                self.account.auth_id,
                self.account.auth_name,
                self.account.device_id,
                self.account.id,
            ]
            candidates = []
            def add(path):
                if path != profile_dir and path not in candidates:
                    candidates.append(path)
            try:
                add(self.account.shared_login_profile_dir(self.profile_root))
            except Exception:
                pass
            add(platform_dir / str(self.account.id))
            for raw_key in raw_keys:
                if not raw_key:
                    continue
                safe_key = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in str(raw_key)).strip("_")
                if not safe_key:
                    continue
                for prefix in ("name", "auth", "robot"):
                    add(platform_dir / f"{prefix}_{safe_key}")
            return candidates

    def _migrate_legacy_douyin_profile(self, profile_dir) -> None:
            if profile_dir.exists() and self._profile_has_authish_data(profile_dir):
                return
            candidates = [p for p in self._candidate_legacy_douyin_profile_dirs(profile_dir) if self._profile_has_authish_data(p)]
            if not candidates:
                return
            candidates.sort(key=lambda p: self._profile_activity_mtime(p), reverse=True)
            best_dir = candidates[0]
            try:
                profile_dir.parent.mkdir(parents=True, exist_ok=True)
                if profile_dir.exists() and not self._profile_has_authish_data(profile_dir):
                    shutil.rmtree(profile_dir, ignore_errors=True)
                shutil.copytree(best_dir, profile_dir, dirs_exist_ok=True)
                self._log("INFO", f"已复用同账号历史浏览器登录状态：{best_dir.name} -> {profile_dir.name}")
            except Exception as exc:
                self._log("WARN", f"迁移同账号浏览器登录状态失败，将使用当前目录：{type(exc).__name__}: {str(exc)[:120]}")

    def _shared_profile_key_for_dir(self, profile_dir) -> str:
            try:
                return str(profile_dir.resolve())
            except Exception:
                return str(profile_dir.absolute())

    def _acquire_shared_douyin_profile(self, profile_dir, profile_name: str) -> QWebEngineProfile:
            """Return the single QWebEngineProfile object for this persistent directory.

            Same-name private-message/comment robots are allowed to share login state,
            but they must not create two independent QWebEngineProfile objects pointing
            at the same storage path.  Qt WebEngine can show blank pages in that case.
            Sharing the profile object keeps cookies common while each robot keeps its
            own page, controller state, timers, preview and logs.
            """
            key = self._shared_profile_key_for_dir(profile_dir)
            with _DOUYIN_SHARED_PROFILE_LOCK:
                entry = _DOUYIN_SHARED_PROFILE_BY_PATH.get(key)
                if isinstance(entry, dict) and isinstance(entry.get("profile"), QWebEngineProfile):
                    entry["refs"] = int(entry.get("refs") or 0) + 1
                    self._shared_profile_key = key
                    profile = entry["profile"]
                    self._log("INFO", f"抖音复用同名账号共享 WebEngineProfile：{profile_dir}，refs={entry['refs']}")
                    try:
                        profile.cookieStore().cookieAdded.connect(self._on_cookie_added)
                        profile.cookieStore().loadAllCookies()
                    except Exception:
                        pass
                    return profile

                parent = QApplication.instance()
                profile = QWebEngineProfile(profile_name, parent)
                profile.setPersistentStoragePath(str(profile_dir))
                profile.setCachePath(str(profile_dir / "cache"))
                try:
                    profile.setHttpCacheType(QWebEngineProfile.HttpCacheType.DiskHttpCache)
                except Exception:
                    pass
                try:
                    profile.setPersistentCookiesPolicy(QWebEngineProfile.PersistentCookiesPolicy.ForcePersistentCookies)
                except Exception:
                    try:
                        profile.setPersistentCookiesPolicy(QWebEngineProfile.ForcePersistentCookies)
                    except Exception:
                        pass
                profile.setHttpUserAgent(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 MatrixFlow/1.0"
                )
                try:
                    profile.cookieStore().cookieAdded.connect(self._on_cookie_added)
                    profile.cookieStore().loadAllCookies()
                except Exception:
                    pass
                _DOUYIN_SHARED_PROFILE_BY_PATH[key] = {
                    "profile": profile,
                    "refs": 1,
                    "path": str(profile_dir),
                    "created_at": time.time(),
                }
                self._shared_profile_key = key
                self._log("INFO", f"抖音创建同名账号共享 WebEngineProfile：{profile_dir}，refs=1")
                return profile

    def _release_shared_douyin_profile(self) -> None:
            key = getattr(self, "_shared_profile_key", "") or ""
            self._shared_profile_key = ""
            if not key:
                return
            profile_to_delete = None
            with _DOUYIN_SHARED_PROFILE_LOCK:
                entry = _DOUYIN_SHARED_PROFILE_BY_PATH.get(key)
                if not isinstance(entry, dict):
                    return
                refs = max(0, int(entry.get("refs") or 0) - 1)
                entry["refs"] = refs
                if refs <= 0:
                    profile_to_delete = entry.get("profile")
                    _DOUYIN_SHARED_PROFILE_BY_PATH.pop(key, None)
            if isinstance(profile_to_delete, QWebEngineProfile):
                try:
                    profile_to_delete.deleteLater()
                except Exception:
                    pass

    def ensure_view(self) -> QWebEngineView:
            if self.view is not None:
                self._ensure_background_host_geometry()
                return self.view

            profile_dir = self.account.shared_login_profile_dir(self.profile_root)
            self._migrate_legacy_douyin_profile(profile_dir)
            profile_dir.mkdir(parents=True, exist_ok=True)

            profile_name = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in str(profile_dir.name or self.account.id))
            self.profile = self._acquire_shared_douyin_profile(profile_dir, profile_name)

            self.page = QWebEnginePage(self.profile, self)
            self.page.titleChanged.connect(self._on_title_changed)
            self.page.urlChanged.connect(self._on_url_changed)
            self.page.loadFinished.connect(self._on_load_finished)
            settings = self.page.settings()
            settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.PluginsEnabled, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.ScrollAnimatorEnabled, True)

            self.work_window = QWidget()
            self.work_window.setObjectName(f"MatrixFlowWorkHost-{self.account.id}")
            self.work_window.setWindowTitle(f"MatrixFlowWorkHost-{self.account.id}")
            self.work_window.setWindowFlag(Qt.WindowType.Tool, True)
            self.work_window.setWindowFlag(Qt.WindowType.FramelessWindowHint, True)
            self.work_window.setWindowFlag(Qt.WindowType.WindowDoesNotAcceptFocus, True)
            self.work_window.setWindowFlag(Qt.WindowType.BypassWindowManagerHint, True)
            self.work_window.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating, True)
            self.work_window.setAttribute(Qt.WidgetAttribute.WA_DontShowOnScreen, True)
            self.work_window.setGeometry(-20000, -20000, *self.background_viewport)
            layout = QVBoxLayout(self.work_window)
            layout.setContentsMargins(0, 0, 0, 0)
            layout.setSpacing(0)

            self.view = QWebEngineView(self.work_window)
            self.view.setPage(self.page)
            self.view.setZoomFactor(1.0)
            self.view.setMinimumSize(*self.background_viewport)
            self.view.resize(*self.background_viewport)
            layout.addWidget(self.view)
            self._ensure_background_host_geometry()
            self.work_window.show()
            return self.view

    def _ensure_background_host_geometry(self) -> None:
            if not self.work_window or not self.view:
                return
            width, height = self.background_viewport
            self.work_window.setMinimumSize(width, height)
            self.work_window.resize(width, height)
            self.work_window.move(-20000, -20000)
            self.view.setMinimumSize(width, height)
            self.view.resize(width, height)
            self.view.show()
            if not self.work_window.testAttribute(Qt.WidgetAttribute.WA_DontShowOnScreen):
                self.work_window.setAttribute(Qt.WidgetAttribute.WA_DontShowOnScreen, True)
            self.work_window.show()

    def _ensure_preview(self) -> None:
            self.ensure_view()
            if self.preview_page is not None and self.preview_view is not None:
                return
            assert self.profile is not None
            self.preview_page = QWebEnginePage(self.profile, self)
            preview_settings = self.preview_page.settings()
            preview_settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
            preview_settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
            preview_settings.setAttribute(QWebEngineSettings.WebAttribute.PluginsEnabled, True)
            preview_settings.setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)
            preview_settings.setAttribute(QWebEngineSettings.WebAttribute.ScrollAnimatorEnabled, True)

            self.preview_view = QWebEngineView()
            self.preview_view.setPage(self.preview_page)
            self.preview_view.setZoomFactor(1.0)

    def logout_platform_account(self) -> None:
            """Clear the local browser login state for the bound platform account.

            This is intentionally local-only: it clears the embedded browser profile
            used by UCP and does not call any remote backend revoke API.
            """
            profile_dir = self.account.shared_login_profile_dir(self.profile_root)
            try:
                self.stop()
            except Exception:
                pass

            try:
                if self.profile is not None:
                    try:
                        self.profile.cookieStore().deleteAllCookies()
                    except Exception:
                        pass
                    try:
                        self.profile.clearHttpCache()
                    except Exception:
                        pass
            except Exception:
                pass

            try:
                if self.preview_view is not None:
                    self.preview_view.setPage(None)
                    self.preview_view.deleteLater()
            except Exception:
                pass
            try:
                if self.preview_page is not None:
                    self.preview_page.deleteLater()
            except Exception:
                pass
            try:
                if self.view is not None:
                    self.view.setPage(None)
                    self.view.deleteLater()
            except Exception:
                pass
            try:
                if self.page is not None:
                    self.page.deleteLater()
            except Exception:
                pass
            try:
                if self.work_window is not None:
                    self.work_window.close()
                    self.work_window.deleteLater()
            except Exception:
                pass
            try:
                self._release_shared_douyin_profile()
            except Exception:
                pass

            self.preview_view = None
            self.preview_page = None
            self.view = None
            self.page = None
            self.work_window = None
            self.profile = None
            self.preview_visible = False

            def _remove_profile_dir() -> None:
                try:
                    if profile_dir.exists():
                        shutil.rmtree(profile_dir, ignore_errors=True)
                except Exception as exc:
                    self._log("WARN", f"清理浏览器登录状态目录失败：{exc}")
                    return
                self._log("INFO", f"已清理浏览器登录状态目录：{profile_dir}")

            QTimer.singleShot(800, _remove_profile_dir)

    def shutdown_webengine(self) -> None:
            """Detach WebEngine objects and release shared profile references."""
            try:
                if hasattr(self, "poll_timer"):
                    self.poll_timer.stop()
            except Exception:
                pass
            try:
                if self.preview_page is not None:
                    self.preview_page.load(QUrl("about:blank"))
            except Exception:
                pass
            try:
                if self.page is not None:
                    self.page.load(QUrl("about:blank"))
            except Exception:
                pass
            try:
                if self.preview_view is not None:
                    self.preview_view.setPage(None)
                    self.preview_view.deleteLater()
            except Exception:
                pass
            try:
                if self.preview_page is not None:
                    self.preview_page.deleteLater()
            except Exception:
                pass
            try:
                if self.view is not None:
                    self.view.setPage(None)
                    self.view.deleteLater()
            except Exception:
                pass
            try:
                if self.page is not None:
                    self.page.deleteLater()
            except Exception:
                pass
            try:
                if self.work_window is not None:
                    self.work_window.close()
                    self.work_window.deleteLater()
            except Exception:
                pass
            self.preview_view = None
            self.preview_page = None
            self.view = None
            self.page = None
            self.work_window = None
            try:
                self._release_shared_douyin_profile()
            except Exception:
                pass
            self.profile = None
            self.preview_visible = False

    def is_running(self) -> bool:
            return self.running

    def current_state(self) -> str:
            return self.last_state

    def preview_widget(self) -> QWebEngineView:
            self._ensure_preview()
            assert self.preview_view is not None
            return self.preview_view

    def open_preview(self) -> None:
            self._ensure_preview()
            self.preview_visible = True
            self.sync_preview(force=False)

    def release_preview(self, *, destroy: bool = False) -> None:
            self.preview_visible = False
            if destroy and self.preview_page is not None:
                self.preview_page.load(QUrl("about:blank"))

    def sync_preview(self, *, force: bool = False) -> None:
            if not self.preview_page or not self.preview_visible:
                return
            desired_url = ""
            if self.page and self.page.url().isValid() and self.page.url().toString():
                desired_url = self.page.url().toString()
            if not desired_url or desired_url == "about:blank":
                desired_url = self.target_url
            current_preview_url = self.preview_page.url().toString() if self.preview_page else ""
            if not force and current_preview_url == desired_url:
                return
            self.preview_page.load(QUrl(desired_url))

    def try_click(self, text: str) -> None:
            if not self.page:
                self._log("WARN", f"尚未创建页面，无法点击: {text}")
                return
            self._log("INFO", f"尝试点击文本按钮: {text}")
            self.busy = True
            self.page.runJavaScript(build_click_text_script(text), self._handle_click_result)

    def _load_target(self, reason: str) -> None:
            if not self.view:
                return
            self.last_nav_request_ms = self._now_ms()
            self._log("INFO", f"请求导航到目标模块（{reason}）: {self.target_url}")
            self.view.load(QUrl(self.target_url))
            self.sync_preview(force=True)

    def _coerce_js_result(self, result: Any) -> Any:
            if isinstance(result, str):
                raw = result.strip()
                if raw.startswith("{") or raw.startswith("["):
                    try:
                        return json.loads(raw)
                    except Exception as exc:
                        self._log("WARN", f"JS 返回字符串但 JSON 解析失败: {exc}；原始片段={raw[:240]}")
                        return result
            return result

    def _handle_click_result(self, result: Any) -> None:
            self.busy = False
            result = self._coerce_js_result(result)
            if not isinstance(result, dict):
                self._log("WARN", f"点击结果异常，类型={type(result).__name__}，内容片段={str(result)[:240]}")
                return
            if result.get("clicked"):
                self._log("INFO", f"点击成功: {result.get('text', '')}")
            else:
                extra = f"，错误={result.get('error')}" if result.get("error") else ""
                self._log("WARN", f"未找到可点击文本: {result.get('text', '')}{extra}")

    def _on_title_changed(self, title: str) -> None:
            self.title_changed.emit(self.account.id, title)

    def _on_url_changed(self, url: QUrl) -> None:
            self._ensure_background_host_geometry()
            current_url = url.toString() if url is not None else ""
            self._log("INFO", f"页面地址变化: {current_url}")
            lower_url = current_url.lower()
            if (
                getattr(self, "running", False)
                and getattr(self, "ready", False)
                and ("login" in lower_url or "passport" in lower_url)
                and hasattr(self, "_enter_douyin_login_wait_guard")
            ):
                try:
                    self._enter_douyin_login_wait_guard("login_wait", {"loginUiVisible": True, "loginHits": ["url_changed_login"]}, current_url)
                except Exception as exc:
                    self._log("WARN", f"抖音登录状态回退处理异常: {type(exc).__name__}: {exc}")
            self.sync_preview(force=True)

    def _on_load_finished(self, ok: bool) -> None:
            self._ensure_background_host_geometry()
            current_url = self.page.url().toString() if self.page else ""
            self._log("INFO", f"页面加载完成: ok={ok}，当前 URL={current_url}")
            if ok and self.running and self._has_confirmed_auth() and not self.ready:
                if self._is_home_url(current_url):
                    self._schedule_post_login_target_reentry("loadFinished 后仍在首页", delay_ms=600)
                elif self._is_target_url(current_url):
                    self._schedule_post_login_target_reentry("loadFinished 后目标模块未就绪", delay_ms=1500)
