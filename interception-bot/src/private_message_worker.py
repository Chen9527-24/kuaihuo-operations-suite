from __future__ import annotations

import json
import os
import random
import re
import shutil
import sqlite3
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

from .process_utils import no_window_creationflags, no_window_startupinfo
from typing import Any, Dict, Iterable, Optional
from urllib import parse

from playwright.sync_api import BrowserContext, TimeoutError as PlaywrightTimeoutError, sync_playwright

from .browser_session import BrowserSession
from .core_nexus_client import CoreNexusClient


GUI_PRIVATE_MESSAGE_REQUEST_PREFIX = "[GUI_PM_REQUEST]"


@dataclass
class PrivateMessageRuntimeOptions:
    robot_id: str
    base_dir: Path
    robot_name: str = ""
    browser_name: str = "chromium"
    headless: bool = True
    storage_state_path: Optional[Path] = None
    poll_interval_sec: int = 10
    max_empty_rounds: int = 3


class RuntimeSessionLock:
    """Cross-process lock with stale-lock recovery.

    The GUI stops worker subprocesses forcefully in some cases. If the old process is
    killed before Python can run __exit__, a *.lock file is left behind. The next
    private-message run must not be blocked by that dead lock forever, so the lock
    records the owner PID and removes the file when that PID is no longer alive.
    """

    def __init__(self, lock_dir: Path, key: str):
        self.lock_dir = lock_dir
        self.key = re.sub(r"[^A-Za-z0-9_-]+", "_", key).strip("_") or "private_message"
        self.path = self.lock_dir / f"{self.key}.lock"
        self.fd: Optional[int] = None

    def __enter__(self) -> "RuntimeSessionLock":
        self.lock_dir.mkdir(parents=True, exist_ok=True)
        for attempt in range(2):
            try:
                self.fd = os.open(str(self.path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                payload = {
                    "pid": os.getpid(),
                    "key": self.key,
                    "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                }
                os.write(self.fd, json.dumps(payload, ensure_ascii=False).encode("utf-8"))
                print(f"[LOCK] 已获取主动私信运行锁：{self.path}")
                return self
            except FileExistsError as exc:
                owner_pid = self._read_owner_pid()
                if owner_pid and self._is_process_alive(owner_pid):
                    raise RuntimeError(
                        f"当前账号会话已有截流/主动私信任务占用，等待后再启动：{self.path} pid={owner_pid}"
                    ) from exc
                try:
                    self.path.unlink(missing_ok=True)
                    print(f"[LOCK] 已清理主动私信残留运行锁：{self.path} oldPid={owner_pid or '-'}")
                    continue
                except Exception as cleanup_exc:
                    raise RuntimeError(f"主动私信运行锁已残留且无法清理：{self.path} error={cleanup_exc}") from exc
        raise RuntimeError(f"主动私信运行锁创建失败：{self.path}")

    def __exit__(self, exc_type, exc, tb) -> None:
        if self.fd is not None:
            try:
                os.close(self.fd)
            except Exception:
                pass
            self.fd = None
        try:
            self.path.unlink(missing_ok=True)
            print(f"[LOCK] 已释放主动私信运行锁：{self.path}")
        except Exception:
            pass

    def _read_owner_pid(self) -> Optional[int]:
        try:
            text = self.path.read_text(encoding="utf-8", errors="ignore").strip()
        except Exception:
            return None
        if not text:
            return None
        if text.isdigit():
            try:
                return int(text)
            except Exception:
                return None
        try:
            data = json.loads(text)
            pid = data.get("pid") if isinstance(data, dict) else None
            return int(pid) if pid else None
        except Exception:
            match = re.search(r"\bpid\D+(\d+)\b", text, flags=re.IGNORECASE)
            if match:
                try:
                    return int(match.group(1))
                except Exception:
                    return None
        return None

    def _is_process_alive(self, pid: int) -> bool:
        if pid <= 0:
            return False
        if pid == os.getpid():
            return True
        if os.name == "nt":
            try:
                result = subprocess.run(
                    ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                    capture_output=True,
                    text=False,
                    timeout=4,
                    creationflags=no_window_creationflags(),
                    startupinfo=no_window_startupinfo(),
                )
                raw_output = (result.stdout or b"") + (result.stderr or b"")
                output = ""
                for encoding in ("mbcs", "gbk", "utf-8"):
                    try:
                        output = raw_output.decode(encoding, errors="ignore")
                        break
                    except Exception:
                        continue
                if "No tasks" in output or "没有运行" in output or "信息:" in output and str(pid) not in output:
                    return False
                return str(pid) in output
            except Exception:
                # 如果 Windows 检测失败，不要让残留锁永久卡死；后续仍可由 GUI 控制单进程启动。
                return False
        try:
            os.kill(pid, 0)
            return True
        except ProcessLookupError:
            return False
        except PermissionError:
            return True
        except Exception:
            return False


class PrivateMessageWorker:
    def __init__(self, client: CoreNexusClient, options: PrivateMessageRuntimeOptions):
        self.client = client
        self.options = options
        self._cdp_playwright = None
        self._cdp_browser = None
        self._cdp_page = None
        self._cdp_enabled = False
        self._force_gui_workspace = False

    def run(self) -> int:
        runtime = self.client.get_private_message_runtime_config(self.options.robot_id)
        config = self._config(runtime)
        if config.get("enabled") is False:
            print("[SKIP] 主动私信机器人未启用")
            return 0
        if config.get("paused") is True:
            print("[SKIP] 主动私信机器人已暂停")
            return 0

        platform = str(runtime.get("platform") or "DOUYIN")
        if platform.upper() != "DOUYIN":
            raise ValueError("当前主动私信仅实现抖音")
        auth_id = self._first_runtime_text(runtime, "authId", "accountAuthId", "platformAuthId")
        device_id = self._first_runtime_text(runtime, "deviceId", "deviceFingerprint", "browserDeviceId")
        robot_name = (
            str(self.options.robot_name or "").strip()
            or self._first_runtime_text(runtime, "name", "robotName", "displayName", "title")
            or self.options.robot_id
        )

        # 运行锁仍以 robot_id 为兜底，避免同名机器人同时启动时互相覆盖进程锁。
        # 浏览器登录态则按“机器人名称”优先匹配：如果截流机器人和主动私信机器人
        # 使用同一个名称，就复用同一个已登录 Playwright profile；不同名称则默认隔离。
        identity_parts = [platform]
        if auth_id or device_id:
            identity_parts.extend([auth_id or "auth_unknown", device_id or "device_unknown"])
        else:
            identity_parts.extend(["robot", self.options.robot_id])

        profile_key = self._safe_key("pm", robot_name, self.options.robot_id)
        primary_profile_dir = self.options.base_dir / "profiles" / platform.lower() / profile_key
        profile_dir = self._select_private_message_profile_dir(platform, primary_profile_dir, robot_name=robot_name)
        lock_key = self._safe_key(*identity_parts)
        print(f"[LOCK] 主动私信运行锁标识：{lock_key}")
        print(f"[AUTH] 主动私信机器人名称：{robot_name}")
        print(f"[AUTH] 主动私信 Playwright profile：{profile_dir}")

        with RuntimeSessionLock(self.options.base_dir / "state" / "runtime_locks", lock_key):
            if self._should_use_cdp_workspace():
                try:
                    return self._run_with_cdp_workspace(runtime)
                except Exception as exc:
                    fallback = os.getenv("ACS_PM_CDP_FALLBACK", "playwright").strip().lower()
                    print(f"[CDP] 主动私信接管右侧工作区失败：{exc}")
                    if fallback in {"gui", "workspace"}:
                        print("[CDP] 已按 ACS_PM_CDP_FALLBACK=gui 降级为右侧工作区 JS 执行。")
                        self._force_gui_workspace = True
                        return self._poll_and_execute(None, runtime)
                    if fallback in {"fail", "strict", "none"}:
                        raise RuntimeError(
                            "无法通过 CDP 接管右侧工作区；Qt WebEngine 的 CDP 与 Playwright connect_over_cdp 并不完全兼容。"
                            "如需继续尝试 CDP，请修复连接兼容性后再设置 ACS_PM_CDP_FALLBACK=fail。"
                        ) from exc
                    print("[CDP] 已降级为截流同款 Playwright profile 执行。")

            if self._should_use_gui_workspace():
                print("[GUI_PM] ACS_PM_USE_GUI_WORKSPACE=1; using right-side GUI workspace and skipping Playwright browser session.")
                return self._poll_and_execute(None, runtime)

            with BrowserSession(
                profile_dir=profile_dir,
                headless=self.options.headless,
                slow_mo_ms=0,
                browser_name=self.options.browser_name,
                storage_state_path=self.options.storage_state_path,
            ) as context:
                return self._poll_and_execute(context, runtime)

    def _select_private_message_profile_dir(self, platform: str, primary_profile_dir: Path, *, robot_name: str = "") -> Path:
        """Pick the Playwright profile used by the private-message worker.

        Login identity is keyed by platform + robot name.  Interception robots and
        private-message robots with the same display name are treated as the same
        platform account; different names must never reuse each other's login state.

        Runtime isolation is a separate concern: the private-message worker does not
        directly lock or mutate the shared same-name profile.  When a same-name
        authenticated profile is found, it is copied into this robot's own runtime
        profile before Chromium starts.  This preserves multi-account concurrency and
        avoids Chromium profile-lock conflicts while still reusing the correct login.

        Modes:
        - shared_runtime/name_match/default: copy same-name authenticated profile into
          this robot's runtime profile, then run from the runtime profile.
        - shared_by_name/direct_shared: directly use the same-name profile; keep this
          only for manual compatibility testing because concurrent Chromium processes
          can conflict on one profile directory.
        - isolated/private/robot: use this robot's own runtime profile only.
        - legacy_reuse/any_auth: temporary compatibility fallback to reuse the most
          recent authenticated profile even without name metadata.
        """
        mode = os.getenv("ACS_PM_PROFILE_MODE", "shared_runtime").strip().lower()
        robot_name = str(robot_name or "").strip()
        platform_dir = self.options.base_dir / "profiles" / str(platform or "douyin").lower()

        if mode in {"isolated", "private", "robot", "strict", "name_isolated"}:
            self._write_profile_metadata(
                primary_profile_dir,
                platform=platform,
                robot_id=self.options.robot_id,
                robot_name=robot_name,
                robot_type="LEAD_PRIVATE_MESSAGE",
                purpose="private_message_isolated",
            )
            print("[AUTH] ACS_PM_PROFILE_MODE=isolated，主动私信使用本机器人独立 Playwright profile。")
            return primary_profile_dir

        candidates = self._list_profile_candidates(platform_dir, exclude=primary_profile_dir)
        named_matches: list[tuple[Path, Dict[str, Any], Dict[str, Any]]] = []
        legacy_authed: list[tuple[Path, Dict[str, Any], Dict[str, Any], float]] = []
        target_name_key = self._normalize_robot_name_key(robot_name)

        for item in candidates:
            meta = self._read_profile_metadata(item)
            hint = self._profile_cookie_auth_hint(item)
            if hint.get("hasStrongAuthCookie"):
                modified = self._profile_modified_time(item)
                legacy_authed.append((item, meta, hint, modified))
            meta_name = str(meta.get("robotName") or meta.get("name") or "").strip()
            meta_name_key = str(meta.get("robotNameKey") or self._normalize_robot_name_key(meta_name))
            if target_name_key and meta_name_key == target_name_key and hint.get("hasStrongAuthCookie"):
                named_matches.append((item, meta, hint))

        if named_matches:
            named_matches.sort(key=lambda row: (self._profile_reuse_priority(row[0], row[1]), self._profile_modified_time(row[0])), reverse=True)
            selected, meta, hint = named_matches[0]
            if mode in {"shared_by_name", "name_match_direct", "direct_shared", "reuse_same_name_direct"}:
                self._write_profile_metadata(
                    selected,
                    platform=platform,
                    robot_id=str(meta.get("robotId") or self.options.robot_id),
                    robot_name=robot_name,
                    robot_type=str(meta.get("robotType") or meta.get("sourceRobotType") or "SHARED_BY_NAME"),
                    purpose="shared_by_robot_name_direct",
                    extra={
                        "lastUsedByRobotId": self.options.robot_id,
                        "lastUsedByRobotType": "LEAD_PRIVATE_MESSAGE",
                        "matchedBy": "robotName",
                    },
                )
                print(
                    "[AUTH] ACS_PM_PROFILE_MODE=direct_shared，主动私信直接使用同名 Playwright profile，"
                    f"robotName={robot_name}，profile={selected}，profileAuthHint={hint}。"
                )
                return selected

            copied = self._refresh_runtime_profile_from_shared_source(
                source_profile_dir=selected,
                runtime_profile_dir=primary_profile_dir,
                platform=platform,
                robot_name=robot_name,
                source_meta=meta,
                source_hint=hint,
            )
            if copied:
                print(
                    "[AUTH] 主动私信已复用同名登录态到独立运行 profile："
                    f"robotName={robot_name}，source={selected}，runtime={primary_profile_dir}，profileAuthHint={hint}。"
                )
            else:
                print(
                    "[AUTH] WARN 同名登录态复制不完整，仍尝试使用独立运行 profile："
                    f"robotName={robot_name}，source={selected}，runtime={primary_profile_dir}，profileAuthHint={hint}。"
                )
            return primary_profile_dir

        own_hint = self._profile_cookie_auth_hint(primary_profile_dir) if primary_profile_dir.exists() else {"hasStrongAuthCookie": False, "strongCookieNames": []}
        if own_hint.get("hasStrongAuthCookie"):
            self._write_profile_metadata(
                primary_profile_dir,
                platform=platform,
                robot_id=self.options.robot_id,
                robot_name=robot_name,
                robot_type="LEAD_PRIVATE_MESSAGE",
                purpose="private_message_runtime_authenticated",
            )
            print(f"[AUTH] 使用主动私信本机器人已有运行 profile：{primary_profile_dir}，profileAuthHint={own_hint}。")
            return primary_profile_dir

        if legacy_authed and mode in {"legacy_reuse", "reuse_intercept", "any_auth"}:
            legacy_authed.sort(key=lambda row: row[3], reverse=True)
            selected, meta, hint, _modified = legacy_authed[0]
            copied = self._refresh_runtime_profile_from_shared_source(
                source_profile_dir=selected,
                runtime_profile_dir=primary_profile_dir,
                platform=platform,
                robot_name=robot_name or str(meta.get("robotName") or ""),
                source_meta=meta,
                source_hint=hint,
                matched_by="legacy_authenticated_profile",
            )
            print(
                "[AUTH] ACS_PM_PROFILE_MODE=legacy_reuse，已将历史已登录 profile 复制到主动私信运行 profile，"
                f"copied={copied}，source={selected}，runtime={primary_profile_dir}，profileAuthHint={hint}。"
            )
            return primary_profile_dir
        if legacy_authed:
            print("[AUTH] 已发现其它机器人历史登录态，但名称不匹配，已按多账号隔离规则拒绝复用。")

        self._write_profile_metadata(
            primary_profile_dir,
            platform=platform,
            robot_id=self.options.robot_id,
            robot_name=robot_name,
            robot_type="LEAD_PRIVATE_MESSAGE",
            purpose="private_message_empty",
        )
        print(
            "[AUTH] 主动私信未找到同名可复用登录态，将使用独立运行 profile；"
            "启动前验证未通过时不会领取任务。请先在同名右侧工作区完成登录，或先运行同名截流机器人生成 Playwright 登录态。"
        )
        return primary_profile_dir

    def _refresh_runtime_profile_from_shared_source(
        self,
        *,
        source_profile_dir: Path,
        runtime_profile_dir: Path,
        platform: str,
        robot_name: str,
        source_meta: Dict[str, Any],
        source_hint: Dict[str, Any],
        matched_by: str = "robotName",
    ) -> bool:
        """Copy a same-name authenticated profile into this worker's runtime profile.

        Chromium profiles cannot be safely opened by multiple processes at the same
        time.  Copying gives each private-message robot an isolated runtime directory
        while preserving the same-name login state.  Volatile cache/lock files are
        skipped intentionally.
        """
        try:
            source = source_profile_dir.resolve()
            dest = runtime_profile_dir.resolve()
        except Exception:
            source = source_profile_dir
            dest = runtime_profile_dir
        if source == dest:
            return True
        if not source.exists():
            return False

        refresh = os.getenv("ACS_PM_REFRESH_RUNTIME_PROFILE", "1").strip().lower() not in {"0", "false", "no", "off"}
        if refresh and dest.exists():
            try:
                shutil.rmtree(dest, ignore_errors=True)
            except Exception as exc:
                print(f"[AUTH] WARN 清理主动私信运行 profile 失败，将覆盖复制：{dest} error={exc}")
        dest.mkdir(parents=True, exist_ok=True)

        skip_dir_names = {
            "cache", "code cache", "gpucache", "shadercache", "dawncache", "grshadercache",
            "crashpad", "browsermetrics", "blob_storage", "media cache", "service worker\\cacheStorage".lower(),
            "downloads", "traces", "_playwright_tmp",
        }
        skip_file_names = {
            "lock", "singletonlock", "singletoncookie", "singletonsocket", "devtoolsactiveport",
            "runningchromeversion", "browsermetrics-spare.pma",
        }
        copied_files = 0
        skipped_files = 0

        def should_skip(path: Path) -> bool:
            lower_parts = [part.lower() for part in path.parts]
            if any(part in skip_dir_names for part in lower_parts):
                return True
            name = path.name.lower()
            if name in skip_file_names or name.endswith("-journal") or name.endswith("-shm") or name.endswith("-wal"):
                # WAL/SHM are skipped to avoid copying half-written SQLite sidecars.  The
                # main DB is copied; Chromium can rebuild sidecars on launch.
                return True
            return False

        try:
            for root, dirs, files in os.walk(source):
                root_path = Path(root)
                rel_root = root_path.relative_to(source)
                dirs[:] = [d for d in dirs if not should_skip(rel_root / d)]
                target_root = dest / rel_root
                target_root.mkdir(parents=True, exist_ok=True)
                for name in files:
                    rel_file = rel_root / name
                    if should_skip(rel_file):
                        skipped_files += 1
                        continue
                    src_file = root_path / name
                    dst_file = target_root / name
                    try:
                        shutil.copy2(src_file, dst_file)
                        copied_files += 1
                    except Exception:
                        skipped_files += 1
                        continue
        except Exception as exc:
            print(f"[AUTH] WARN 复制同名登录态 profile 失败：source={source} dest={dest} error={exc}")

        self._write_profile_metadata(
            dest,
            platform=platform,
            robot_id=self.options.robot_id,
            robot_name=robot_name,
            robot_type="LEAD_PRIVATE_MESSAGE",
            purpose="private_message_runtime_from_shared_login",
            extra={
                "sourceProfile": str(source),
                "sourceRobotId": str(source_meta.get("robotId") or ""),
                "sourceRobotType": str(source_meta.get("robotType") or source_meta.get("sourceRobotType") or ""),
                "matchedBy": matched_by,
                "copiedFiles": copied_files,
                "skippedFiles": skipped_files,
                "sourceStrongCookieNames": list(source_hint.get("strongCookieNames") or []),
            },
        )
        own_hint = self._profile_cookie_auth_hint(dest)
        if not own_hint.get("hasStrongAuthCookie") and source_hint.get("hasStrongAuthCookie"):
            print(
                "[AUTH] WARN 同名 profile 已复制，但运行 profile 暂未探测到强登录 Cookie。"
                f" copiedFiles={copied_files} skippedFiles={skipped_files} source={source} dest={dest}"
            )
        return copied_files > 0

    def _list_profile_candidates(self, platform_dir: Path, *, exclude: Path) -> list[Path]:
        candidates: list[Path] = []
        try:
            exclude_resolved = exclude.resolve()
        except Exception:
            exclude_resolved = exclude
        try:
            for item in platform_dir.iterdir():
                if not item.is_dir():
                    continue
                try:
                    if item.resolve() == exclude_resolved:
                        continue
                except Exception:
                    pass
                name = item.name.lower()
                if name in {"_playwright_tmp", "downloads", "traces"} or name.startswith("_"):
                    continue
                candidates.append(item)
        except Exception:
            return []
        return candidates

    def _normalize_robot_name_key(self, value: str) -> str:
        text = str(value or "").strip().lower()
        text = re.sub(r"\s+", "", text)
        return text

    def _profile_metadata_path(self, profile_dir: Path) -> Path:
        return profile_dir / ".acs_profile_meta.json"

    def _read_profile_metadata(self, profile_dir: Path) -> Dict[str, Any]:
        path = self._profile_metadata_path(profile_dir)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _write_profile_metadata(
        self,
        profile_dir: Path,
        *,
        platform: str,
        robot_id: str,
        robot_name: str,
        robot_type: str,
        purpose: str,
        extra: Optional[Dict[str, Any]] = None,
    ) -> None:
        try:
            profile_dir.mkdir(parents=True, exist_ok=True)
            old = self._read_profile_metadata(profile_dir)
            data = dict(old)
            data.update(
                {
                    "platform": str(platform or "DOUYIN"),
                    "robotId": str(robot_id or ""),
                    "robotName": str(robot_name or ""),
                    "robotNameKey": self._normalize_robot_name_key(robot_name),
                    "robotType": str(robot_type or ""),
                    "purpose": str(purpose or ""),
                    "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                }
            )
            if extra:
                data.update(extra)
            self._profile_metadata_path(profile_dir).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as exc:
            print(f"[AUTH] WARN 写入 Playwright profile metadata 失败：{profile_dir} error={exc}")

    def _profile_modified_time(self, path: Path) -> float:
        try:
            modified = path.stat().st_mtime
            for child in path.rglob("*"):
                try:
                    modified = max(modified, child.stat().st_mtime)
                except Exception:
                    pass
            return modified
        except Exception:
            return 0.0

    def _profile_reuse_priority(self, path: Path, meta: Dict[str, Any]) -> int:
        """Prefer stable account-login profiles over private-message runtime copies."""
        robot_type = str(meta.get("robotType") or meta.get("sourceRobotType") or "").upper()
        purpose = str(meta.get("purpose") or "").lower()
        name = path.name.lower()
        if robot_type == "INTERCEPT" or purpose == "intercept_profile":
            return 300
        if "shared" in purpose and "runtime" not in purpose:
            return 260
        if purpose in {"private_message_own_authenticated", "private_message_isolated"}:
            return 180
        if "private_message_runtime" in purpose or name.startswith("pm_") or name.startswith("pm__"):
            return 80
        return 120

    def _douyin_strong_cookie_names(self) -> set[str]:
        return {
            "sessionid", "sessionid_ss", "sid_guard", "sid_tt", "uid_tt", "uid_tt_ss",
            "passport_auth_status", "passport_auth_status_ss", "sid_ucp_v1", "ssid_ucp_v1",
            "n_mh",
        }

    def _profile_cookie_auth_hint(self, profile_dir: Path) -> Dict[str, Any]:
        """Inspect Chromium cookie DB names to choose the profile most likely logged in.

        Cookie values are encrypted on Windows, but cookie names and domains are readable from
        Chromium's SQLite database.  This is only a selection hint; the launched page still
        performs the final runtime login check.
        """
        strong = self._douyin_strong_cookie_names()
        found: set[str] = set()
        cookie_dbs: list[Path] = []
        try:
            for candidate in [
                profile_dir / "Default" / "Network" / "Cookies",
                profile_dir / "Default" / "Cookies",
                profile_dir / "Network" / "Cookies",
                profile_dir / "Cookies",
            ]:
                if candidate.exists() and candidate.is_file():
                    cookie_dbs.append(candidate)
            for candidate in profile_dir.rglob("Cookies"):
                if candidate.is_file() and candidate not in cookie_dbs:
                    cookie_dbs.append(candidate)
        except Exception:
            cookie_dbs = []
        for db_path in cookie_dbs[:8]:
            tmp_path: Optional[Path] = None
            read_path = db_path
            try:
                # Copy first to avoid "database is locked" when Chromium has the profile open.
                with tempfile.NamedTemporaryFile(prefix="pm_cookie_probe_", suffix=".sqlite", delete=False) as fh:
                    tmp_path = Path(fh.name)
                shutil.copy2(db_path, tmp_path)
                read_path = tmp_path
            except Exception:
                read_path = db_path
            try:
                conn = sqlite3.connect(f"file:{read_path}?mode=ro", uri=True)
                try:
                    rows = conn.execute(
                        "select name, host_key from cookies where host_key like ? limit 200",
                        ("%douyin.com%",),
                    ).fetchall()
                    for name, _host in rows:
                        text = str(name or "")
                        if text in strong:
                            found.add(text)
                finally:
                    conn.close()
            except Exception:
                pass
            finally:
                if tmp_path is not None:
                    try:
                        tmp_path.unlink(missing_ok=True)
                    except Exception:
                        pass
        return {"hasStrongAuthCookie": bool(found), "strongCookieNames": sorted(found)}

    def _bool_env(self, name: str, default: str = "0") -> bool:
        value = os.getenv(name, default).strip().lower()
        return value in {"1", "true", "yes", "on"}

    def _should_use_cdp_workspace(self) -> bool:
        # CDP 接管 Qt WebEngine 在当前环境下会触发 Browser.setDownloadBehavior
        # unsupported；主动私信默认回到“截流同款 Playwright 持久化 profile”模式。
        # 需要继续实验 CDP 时再显式设置 ACS_PM_CDP_ENABLED=1。
        if not self._bool_env("ACS_PM_CDP_ENABLED", "0"):
            return False
        return bool(os.getenv("ACS_QTWEBENGINE_CDP_URL", "").strip())

    def _run_with_cdp_workspace(self, runtime: Dict[str, Any]) -> int:
        cdp_url = os.getenv("ACS_QTWEBENGINE_CDP_URL", "").strip()
        if not cdp_url:
            raise RuntimeError("未找到 ACS_QTWEBENGINE_CDP_URL，无法连接右侧工作区 CDP。")
        timeout_ms = int(os.getenv("ACS_PM_CDP_CONNECT_TIMEOUT_MS", "12000") or "12000")
        print(f"[CDP] 尝试通过 CDP 接管右侧工作区：{cdp_url}")
        self._cdp_playwright = sync_playwright().start()
        try:
            self._cdp_browser = self._cdp_playwright.chromium.connect_over_cdp(cdp_url, timeout=timeout_ms)
            self._cdp_page = self._select_cdp_workspace_page(self._cdp_browser, timeout_sec=12)
            self._cdp_enabled = True
            try:
                url = self._cdp_page.url
            except Exception:
                url = ""
            try:
                title = self._cdp_page.title()
            except Exception:
                title = ""
            print(f"[CDP] 已接管右侧工作区页面：url={url or '-'} title={title or '-'}")
            return self._poll_and_execute(None, runtime)
        finally:
            self._cdp_enabled = False
            self._cdp_page = None
            # 不调用 browser.close()，避免把 Qt WebEngine 右侧工作区一起关闭。
            self._cdp_browser = None
            try:
                if self._cdp_playwright is not None:
                    self._cdp_playwright.stop()
            except Exception:
                pass
            self._cdp_playwright = None

    def _select_cdp_workspace_page(self, browser, timeout_sec: int = 10):
        deadline = time.monotonic() + max(2, timeout_sec)
        last_urls: list[str] = []
        while time.monotonic() < deadline:
            pages = []
            try:
                for ctx in browser.contexts:
                    try:
                        pages.extend(list(ctx.pages))
                    except Exception:
                        pass
            except Exception:
                pages = []
            last_urls = []
            for page in pages:
                try:
                    url = page.url or ""
                except Exception:
                    url = ""
                last_urls.append(url)
                if "douyin.com" in url or url.startswith("https://www.douyin.com"):
                    return page
            if pages:
                # GUI 右侧工作区通常只有一个可见页；如果尚未加载到抖音，也先接管这个页，后续 _open_target_profile 会导航到目标主页。
                return pages[0]
            time.sleep(0.35)
        raise RuntimeError(f"CDP 已连接，但没有发现可控制的右侧工作区页面。lastUrls={last_urls}")

    def _poll_and_execute(self, context: BrowserContext, runtime: Dict[str, Any]) -> int:
        config = self._config(runtime)
        platform = str(runtime.get("platform") or "DOUYIN")
        limit = int(config.get("claimBatchSize") or 1)
        empty_rounds = 0
        total_sent = 0
        total_failed = 0
        print(f"[INFO] 私信 worker 已启动：robot={self.options.robot_id} platform={platform} claimBatchSize={limit}")

        if context is not None and not self._should_use_gui_workspace():
            self._verify_private_message_runtime_ready(context, platform)

        while empty_rounds < max(1, self.options.max_empty_rounds):
            runtime = self.client.get_private_message_runtime_config(self.options.robot_id)
            config = self._config(runtime)
            if config.get("paused") is True:
                print("[INFO] 主动私信机器人已暂停，本轮停止领取新任务。")
                break
            if config.get("enabled") is False:
                print("[INFO] 主动私信机器人已禁用，本轮停止。")
                break

            claimed = self.client.claim_private_message_tasks(self.options.robot_id, platform=platform, limit=limit)
            items = claimed.get("items") if isinstance(claimed, dict) else []
            if not isinstance(items, list) or not items:
                reason = claimed.get("reason") if isinstance(claimed, dict) else ""
                empty_rounds += 1
                print(f"[INFO] 暂无可执行主动私信任务。reason={reason or '-'} emptyRound={empty_rounds}")
                if empty_rounds < self.options.max_empty_rounds:
                    time.sleep(max(1, self.options.poll_interval_sec))
                continue

            empty_rounds = 0
            for task in items:
                self._sleep_before_send(config)
                ok, error_message, raw = self._execute_task(context, task)
                status = "SENT" if ok else "FAILED"
                self.client.report_private_message_task(
                    self.options.robot_id,
                    str(task.get("id") or task.get("taskId") or ""),
                    status,
                    error_message=error_message,
                    raw=raw,
                )
                if ok:
                    total_sent += 1
                    print(f"[OK] 主动私信任务已回传 SENT：{task.get('taskNo') or task.get('id')}")
                else:
                    total_failed += 1
                    print(f"[WARN] 主动私信任务已回传 FAILED：{task.get('taskNo') or task.get('id')} reason={error_message}")

        print(f"[DONE] 私信 worker 结束：sent={total_sent} failed={total_failed}")
        return 0 if total_failed == 0 else 1

    def _verify_private_message_runtime_ready(self, context: BrowserContext, platform: str) -> None:
        """Validate login before claiming any private-message task.

        This startup gate prevents bad/expired profiles from consuming tasks and
        reporting false FAILED results.  Task-level login checks remain only as a
        defensive fallback for mid-run expiry or risk-control prompts.
        """
        if str(platform or "").upper() != "DOUYIN":
            return
        page = None
        try:
            page = context.new_page()
            page.set_viewport_size({"width": 1600, "height": 1000})
            page.goto("https://www.douyin.com/", wait_until="domcontentloaded", timeout=60000)
            try:
                page.wait_for_load_state("networkidle", timeout=10000)
            except PlaywrightTimeoutError:
                pass
            page.wait_for_timeout(1200)
            state = self._detect_douyin_login_state(page)
            if self._is_private_message_auth_ready(state):
                print(f"[AUTH] 主动私信启动前登录态验证通过；后续任务执行仅做失效兜底。loginState={state}")
                return
            diag = self._collect_page_diagnostics(page)
            diag["loginState"] = state
            self._save_private_message_debug_snapshot(page, diag)
            raise RuntimeError(
                "主动私信启动前未确认可用抖音登录态，已停止领取任务；"
                "请先在同名机器人右侧工作区完成登录/复用，或设置 ACS_PM_HEADLESS=0 用可见 Playwright 登录一次。"
                f" loginState={json.dumps(state, ensure_ascii=False)}"
            )
        finally:
            if page is not None:
                try:
                    page.close()
                except Exception:
                    pass

    def _execute_task(self, context: BrowserContext, task: Dict[str, Any]) -> tuple[bool, str, Dict[str, Any]]:
        task_id = str(task.get("id") or task.get("taskId") or "")
        message = self._first_text(task, "messageFinal", "messageDraft", "privateMessageDraft", "privateMessageContent")
        target_url = self._resolve_target_profile_url(task)
        if not task_id:
            return False, "任务缺少 taskId", {"task": task}
        if not message:
            return False, "任务缺少私信内容", {"taskId": task_id}
        if not target_url:
            return False, "任务缺少用户主页链接或 userId，无法打开私信入口", {"taskId": task_id, "targetUserId": task.get("targetUserId")}

        task_no = str(task.get("taskNo") or task_id)
        target_label = str(task.get("targetNickname") or task.get("targetUserId") or "-")

        if self._should_use_gui_workspace():
            self._emit_target_event("start", task, target_url, label=target_label)
            try:
                print(f"[TASK] 开始主动私信：task={task_no} user={target_label} url={target_url} mode=gui_workspace")
                result = self._execute_task_in_gui_workspace(task, target_url, message)
                if result.get("ok"):
                    self._emit_target_event("done", task, target_url, label=target_label)
                    return True, "", {"taskId": task_id, "targetUrl": target_url, **result}
                reason = str(result.get("reason") or result.get("error") or "右侧工作区私信执行失败")
                self._emit_target_event("error", task, target_url, label=target_label, error=reason)
                return False, f"私信发送失败：{reason}", {"taskId": task_id, "targetUrl": target_url, **result}
            except Exception as exc:
                self._emit_target_event("error", task, target_url, label=target_label, error=str(exc))
                return False, f"私信发送失败：{exc}", {"taskId": task_id, "targetUrl": target_url, "mode": "gui_workspace"}

        close_page = True
        if self._cdp_enabled and self._cdp_page is not None:
            page = self._cdp_page
            close_page = False
            run_mode = "cdp_workspace"
        else:
            if context is None:
                return False, "没有可用的浏览器执行上下文", {"taskId": task_id, "targetUrl": target_url}
            page = context.new_page()
            run_mode = "playwright"
        try:
            page.set_viewport_size({"width": 1920, "height": 1080})
        except Exception:
            pass
        self._emit_target_event("start", task, target_url, label=target_label)
        try:
            print(f"[TASK] 开始主动私信：task={task_no} user={target_label} url={target_url} mode={run_mode}")
            nav_info = self._open_target_profile(page, target_url)
            print(f"[NAV] 目标主页跳转完成：task={task_no} current={nav_info.get('currentUrl')} title={nav_info.get('title') or '-'}")
            dialog_page = self._click_private_entry(page) or page
            dialog_page = self._wait_for_message_dialog(dialog_page) or dialog_page
            filled_selector = self._fill_message_input(dialog_page, message)
            self._click_send_button(dialog_page)
            dialog_page.wait_for_timeout(1200)
            self._emit_target_event("done", task, target_url, label=target_label)
            return True, "", {"taskId": task_id, "targetUrl": target_url, "filledSelector": filled_selector, "mode": run_mode, **nav_info}
        except Exception as exc:
            diag = self._collect_page_diagnostics(page)
            self._emit_target_event("error", task, target_url, label=target_label, error=str(exc))
            return False, f"私信发送失败：{exc}", {"taskId": task_id, "targetUrl": target_url, "mode": run_mode, **diag}
        finally:
            if close_page:
                try:
                    page.close()
                except Exception:
                    pass

    def _should_use_gui_workspace(self) -> bool:
        if getattr(self, "_force_gui_workspace", False):
            return True
        # 主动私信不再默认控制 GUI 右侧工作区点击。
        # 右侧工作区会受 [TARGET] 事件同步跳转，用于观察当前任务；真正的点击/输入/发送由
        # Playwright 独立页面完成，避免 GUI 页面上“下载电脑客户端”等浮层延迟出现导致坐标偏移，
        # 也避免误点顶部全局私信入口。只有显式设置 ACS_PM_USE_GUI_WORKSPACE=1 时才启用旧 GUI 执行方式。
        return os.getenv("ACS_PM_USE_GUI_WORKSPACE", "0").strip().lower() in {"1", "true", "yes", "on"}

    def _execute_task_in_gui_workspace(self, task: Dict[str, Any], target_url: str, message: str) -> Dict[str, Any]:
        request_id = f"pm_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"
        output_dir = self.options.base_dir / "state" / "gui_private_message"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{request_id}.json"
        payload = {
            "request_id": request_id,
            "output_path": str(output_path),
            "url": target_url,
            "message": message,
            "taskId": str(task.get("id") or task.get("taskId") or ""),
            "taskNo": str(task.get("taskNo") or ""),
            "label": str(task.get("targetNickname") or task.get("targetUserId") or ""),
        }
        print(f"{GUI_PRIVATE_MESSAGE_REQUEST_PREFIX} {json.dumps(payload, ensure_ascii=False)}", flush=True)
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            if output_path.exists():
                try:
                    data = json.loads(output_path.read_text(encoding="utf-8"))
                    if isinstance(data, dict):
                        print(f"[GUI_PM] 右侧工作区私信执行结果：ok={data.get('ok')} reason={data.get('reason') or '-'}")
                        return data
                except Exception as exc:
                    return {"ok": False, "reason": f"read_gui_pm_response_failed: {exc}", "outputPath": str(output_path)}
            time.sleep(0.25)
        return {"ok": False, "reason": "gui_private_message_timeout", "outputPath": str(output_path)}

    def _detect_douyin_login_state(self, page) -> Dict[str, Any]:
        """Return a conservative login-state diagnosis for Douyin private messaging.

        Earlier versions treated any visible/global "登录" text as a login failure.  Douyin
        pages can still render a top-level login entry or generic login words while a valid
        session cookie set is present, especially after importing cookies from the GUI
        workspace.  For active private-message tasks we only hard-block on a real login
        modal, or on missing strong session cookies plus a visible login entry.
        """
        strong_names = self._douyin_strong_cookie_names()
        cookie_names: list[str] = []
        try:
            cookies = page.context.cookies(["https://www.douyin.com", "https://douyin.com"])
            cookie_names = [str(item.get("name") or "") for item in cookies if isinstance(item, dict)]
        except Exception:
            cookie_names = []
        has_strong = any(name in strong_names for name in cookie_names)
        try:
            ui_state = page.evaluate(
                """
                () => {
                  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
                  const bodyText = norm(document.body && document.body.innerText || '');
                  const visible = el => {
                    if (!el) return false;
                    const style = window.getComputedStyle(el);
                    const rect = el.getBoundingClientRect();
                    return style && style.display !== 'none' && style.visibility !== 'hidden'
                      && Number(style.opacity || 1) !== 0 && rect.width > 6 && rect.height > 6;
                  };
                  const textOf = el => norm(el && (el.innerText || el.textContent || el.getAttribute && el.getAttribute('aria-label') || '') || '');
                  const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                  const topLoginButton = buttons.some(el => {
                    if (!visible(el)) return false;
                    const text = textOf(el);
                    const rect = el.getBoundingClientRect();
                    return text === '登录' && rect.top < 130 && rect.left > window.innerWidth * 0.55;
                  });
                  const loginInputs = Array.from(document.querySelectorAll('input')).filter(el => {
                    if (!visible(el)) return false;
                    const ph = norm(el.getAttribute('placeholder') || el.getAttribute('aria-label') || '');
                    const type = String(el.getAttribute('type') || '').toLowerCase();
                    return /手机号|验证码|密码/.test(ph) || ['tel', 'password'].includes(type);
                  }).length;
                  const modalCandidates = Array.from(document.querySelectorAll('div, section, main, [role="dialog"], [class*="modal" i], [class*="login" i]'));
                  const explicitLoginModal = modalCandidates.some(el => {
                    if (!visible(el)) return false;
                    const rect = el.getBoundingClientRect();
                    if (rect.width < 260 || rect.height < 180) return false;
                    const style = window.getComputedStyle(el);
                    const text = textOf(el);
                    const looksOverlay = el.getAttribute('role') === 'dialog'
                      || /modal|dialog|login/i.test(el.className || '')
                      || ['fixed', 'absolute', 'sticky'].includes(style.position)
                      || (rect.left > 80 && rect.top > 40 && rect.right < window.innerWidth - 40 && rect.bottom < window.innerHeight + 80);
                    const loginWords = /扫码登录|验证码登录|密码登录|手机号登录|获取验证码|登录后|打开抖音APP|请先登录/.test(text);
                    const hasInputInside = Array.from(el.querySelectorAll('input')).some(input => {
                      if (!visible(input)) return false;
                      const ph = norm(input.getAttribute('placeholder') || input.getAttribute('aria-label') || '');
                      const type = String(input.getAttribute('type') || '').toLowerCase();
                      return /手机号|验证码|密码/.test(ph) || ['tel', 'password'].includes(type);
                    });
                    return looksOverlay && loginWords && (hasInputInside || /扫码登录|验证码登录|密码登录|手机号登录|请先登录/.test(text));
                  });
                  const hasGenericLoginText = /(^|\s)登录(\s|$)/.test(bodyText) || topLoginButton || explicitLoginModal || loginInputs > 0;
                  const avatarLike = Array.from(document.querySelectorAll('img, [class*="avatar" i], [class*="Avatar" i]')).some(el => {
                    if (!visible(el)) return false;
                    const rect = el.getBoundingClientRect();
                    return rect.top < 110 && rect.left > window.innerWidth * 0.65;
                  });
                  return {
                    topLoginButton,
                    hasLoginModal: explicitLoginModal,
                    hasLoginText: hasGenericLoginText,
                    loginInputCount: loginInputs,
                    avatarLike,
                    bodyTextSample: bodyText.slice(0, 500),
                    href: location.href,
                    title: document.title,
                  };
                }
                """
            )
            if not isinstance(ui_state, dict):
                ui_state = {}
        except Exception as exc:
            ui_state = {"probeError": str(exc)}
        # 强登录 Cookie 是主动私信的主准入依据。抖音页面在已登录状态下仍可能保留
        # 顶部/侧边“登录”入口、下载客户端浮层或隐藏登录 DOM；这些不能直接判定为未登录。
        # 只有缺少强登录 Cookie 时，页面登录信号才作为阻断依据。
        login_required = (not has_strong) and bool(
            ui_state.get("topLoginButton") or ui_state.get("hasLoginModal") or ui_state.get("hasLoginText")
        )
        return {
            "hasStrongAuthCookie": has_strong,
            "strongCookieNames": sorted([name for name in set(cookie_names) if name in strong_names]),
            "cookieNamesSample": sorted([name for name in set(cookie_names) if name])[:40],
            "loginRequired": login_required,
            **ui_state,
        }

    def _pm_requires_strong_auth_cookie(self) -> bool:
        return os.getenv("ACS_PM_REQUIRE_STRONG_AUTH", "1").strip().lower() not in {"0", "false", "no", "off"}

    def _is_private_message_auth_ready(self, login_state: Dict[str, Any]) -> bool:
        # 主动私信不能用页面上的普通“登录”文案作为硬阻断：
        # 1) 抖音已登录页面可能仍展示顶部“登录”入口、下载客户端浮层或隐藏登录 DOM；
        # 2) Qt WebEngine 导出的登录态注入到 Playwright 后，页面首屏有时还没完全刷新账号区；
        # 3) 真正是否能私信，应以强登录 Cookie + 点击后是否出现 IM 会话来验证。
        # 因此，只要存在强登录 Cookie，预检阶段就放行，后续点击私信后再按会话窗口结果判断。
        if bool(login_state.get("hasStrongAuthCookie")):
            return True
        if getattr(self, "_cdp_enabled", False):
            return not bool(login_state.get("hasLoginModal") or login_state.get("topLoginButton") or login_state.get("loginRequired"))
        # 独立 Playwright 模式默认仍要求强登录 Cookie，避免未登录页面误点私信入口。
        if self._pm_requires_strong_auth_cookie():
            return False
        return not bool(login_state.get("loginRequired"))

    def _open_target_profile(self, page, target_url: str) -> Dict[str, Any]:
        page.set_default_timeout(15000)
        page.goto("about:blank", wait_until="domcontentloaded", timeout=15000)
        page.goto(target_url, wait_until="domcontentloaded", timeout=60000)
        try:
            page.wait_for_load_state("networkidle", timeout=12000)
        except PlaywrightTimeoutError:
            # 抖音存在长连接/轮询，networkidle 经常等不到；只作为加载增强，不作为失败条件。
            pass
        ready_selectors = [
            "button:has-text('私信')",
            "button:has-text('发私信')",
            "button:has-text('发送消息')",
            "[data-e2e='user-info']",
            "[data-e2e='im-dialog']",
            "#imSaasContainerId",
            "text=私信",
            "text=关注",
        ]
        self._wait_any_visible(page, ready_selectors, timeout=30000)
        page.wait_for_timeout(800)
        login_state = self._detect_douyin_login_state(page)
        if not self._is_private_message_auth_ready(login_state):
            if not self.options.headless:
                print(
                    "[AUTH] Playwright 当前未确认抖音私信登录态。右侧工作区是 Qt WebEngine，"
                    "私信执行页是 Playwright Chromium，两者不会自动共享完整登录态；"
                    "请在弹出的 Playwright 浏览器里完成一次抖音扫码/登录，程序会等待登录完成后继续。"
                    f" loginState={json.dumps(login_state, ensure_ascii=False)}"
                )
                login_state = self._wait_for_playwright_login(page, target_url, timeout_sec=300)
            else:
                diag = self._collect_page_diagnostics(page)
                diag["loginState"] = login_state
                self._save_private_message_debug_snapshot(page, diag)
                raise RuntimeError(
                    "当前 Playwright 页面未确认抖音私信登录态，点击私信会触发抖音登录弹窗；"
                    "右侧工作区是 Qt WebEngine，Playwright 是独立 Chromium，两者不会自动共享完整登录态。"
                    "请用可见 Playwright 登录一次，或设置 ACS_PM_HEADLESS=0 后重启主动私信机器人。"
                    f" loginState={json.dumps(login_state, ensure_ascii=False)}"
                )
        if login_state.get("hasStrongAuthCookie"):
            if login_state.get("topLoginButton") or login_state.get("hasLoginModal") or login_state.get("hasLoginText"):
                print(f"[AUTH] 已检测到强登录 Cookie，忽略页面残留登录文案/浮层并继续私信流程：{login_state}")
        else:
            print(f"[AUTH] WARN 主动私信页面未检测到强登录 Cookie，但已按页面状态继续：{login_state}")
        current = ""
        title = ""
        try:
            current = page.url
        except Exception:
            pass
        try:
            title = page.title()
        except Exception:
            pass
        if target_url and "/user/" in target_url and current and "douyin.com" in current and "/user/" not in current:
            raise RuntimeError(f"目标主页疑似没有跳转成功：currentUrl={current}")
        return {"currentUrl": current, "title": title}

    def _wait_for_playwright_login(self, page, target_url: str, timeout_sec: int = 240) -> Dict[str, Any]:
        deadline = time.monotonic() + max(30, timeout_sec)
        last_state: Dict[str, Any] = {}
        while time.monotonic() < deadline:
            page.wait_for_timeout(1500)
            try:
                last_state = self._detect_douyin_login_state(page)
            except Exception as exc:
                last_state = {"probeError": str(exc)}
            if self._is_private_message_auth_ready(last_state):
                print(f"[AUTH] Playwright 抖音私信登录态已确认：{last_state}")
                try:
                    current = page.url or ""
                except Exception:
                    current = ""
                if target_url and "/user/" in target_url and target_url.rstrip("/") not in current.rstrip("/"):
                    try:
                        page.goto(target_url, wait_until="domcontentloaded", timeout=60000)
                        try:
                            page.wait_for_load_state("networkidle", timeout=10000)
                        except PlaywrightTimeoutError:
                            pass
                    except Exception:
                        pass
                try:
                    self._wait_any_visible(page, ["button:has-text('私信')", "text=私信", "text=关注"], timeout=30000, raise_on_timeout=False)
                except Exception:
                    pass
                return last_state
            remaining = int(max(0, deadline - time.monotonic()))
            if remaining % 15 in {0, 1}:
                print(f"[AUTH] 等待 Playwright 浏览器完成抖音登录，还剩约 {remaining}s。")
        diag = self._collect_page_diagnostics(page)
        diag["loginState"] = last_state
        self._save_private_message_debug_snapshot(page, diag)
        raise RuntimeError(
            "等待 Playwright 抖音登录超时；请确认弹出的 Playwright 浏览器已经完成登录，"
            f"或先手动运行登录后再启动主动私信。 loginState={json.dumps(last_state, ensure_ascii=False)}"
        )

    def _click_private_entry(self, page):
        if self._is_message_dialog_visible(page):
            return page

        # 私信按钮定位已经确认：真正要点的是资料区“关注”旁边的“私信”，不是右上角全局私信。
        # 之前失败的核心原因是：DOM 找到了按钮，但 el.click() 只是合成事件；而
        # ElementHandle.click 又会因为抖音/Semi 动态布局、遮挡或 actionability 检测超时。
        # 这里改成三段式：
        # 1) JS 精确定位资料区按钮并校验 elementFromPoint；
        # 2) Playwright mouse.click 坐标原生点击；
        # 3) 仍失败时才尝试 ElementHandle/Locator/键盘兜底。
        errors: list[str] = []
        self._prepare_profile_private_area(page)

        for attempt in range(3):
            try:
                clicked = self._mouse_click_profile_private_entry(page, timeout=36000 if attempt == 0 else 12000)
                print(f"[CLICK] 已通过 Playwright 鼠标点击资料区私信入口：attempt={attempt + 1} info={clicked}")
                dialog_page = self._wait_for_message_dialog_any_page(page, timeout=18000)
                if dialog_page:
                    return dialog_page
                if self._handle_login_prompt_after_private_click(page):
                    errors.append(f"mouse_attempt={attempt + 1}: login_prompt_then_waited")
                    self._prepare_profile_private_area(page)
                    continue
                errors.append(f"mouse_attempt={attempt + 1}: clicked_but_dialog_not_visible")
                print(f"[CLICK] 鼠标点击后暂未检测到私信会话窗口，准备重试：attempt={attempt + 1}")
            except Exception as exc:
                errors.append(f"mouse_attempt={attempt + 1}: {exc}")
                print(f"[CLICK] Playwright 鼠标点击资料区私信入口失败：attempt={attempt + 1} error={exc}")
            self._prepare_profile_private_area(page)
            page.wait_for_timeout(1200)

        for attempt in range(2):
            try:
                clicked = self._native_click_profile_private_entry(page, timeout=12000)
                print(f"[CLICK] 已通过 Playwright ElementHandle 点击用户资料区私信入口：attempt={attempt + 1} info={clicked}")
                dialog_page = self._wait_for_message_dialog_any_page(page, timeout=15000)
                if dialog_page:
                    return dialog_page
                if self._handle_login_prompt_after_private_click(page):
                    errors.append(f"element_attempt={attempt + 1}: login_prompt_then_waited")
                    continue
                errors.append(f"element_attempt={attempt + 1}: clicked_but_dialog_not_visible")
            except Exception as native_exc:
                errors.append(f"element_attempt={attempt + 1}: {native_exc}")
                print(f"[CLICK] Playwright ElementHandle 点击资料区私信入口失败：attempt={attempt + 1} error={native_exc}")
            page.wait_for_timeout(900)

        try:
            clicked = self._keyboard_activate_profile_private_entry(page, timeout=10000)
            print(f"[CLICK] 已通过键盘激活资料区私信入口：{clicked}")
            dialog_page = self._wait_for_message_dialog_any_page(page, timeout=15000)
            if dialog_page:
                return dialog_page
            if self._handle_login_prompt_after_private_click(page):
                errors.append("keyboard_activate_login_prompt_then_waited")
            else:
                errors.append("keyboard_activate_but_dialog_not_visible")
        except Exception as exc:
            errors.append(f"keyboard: {exc}")
            print(f"[CLICK] 键盘激活资料区私信入口失败：{exc}")

        # 最后的 JS fallback 只保留用于诊断，不再作为主要路径。
        clicked = self._js_click_profile_private_entry(page)
        if clicked:
            print(f"[CLICK] 已通过 DOM 兜底点击用户资料区私信入口：{clicked}")
            dialog_page = self._wait_for_message_dialog_any_page(page, timeout=12000)
            if dialog_page:
                return dialog_page
            if self._handle_login_prompt_after_private_click(page):
                errors.append("dom_clicked_login_prompt_then_waited")
            else:
                errors.append("dom_clicked_but_dialog_not_visible")

        diag = self._collect_page_diagnostics(page)
        diag["clickErrors"] = errors
        self._save_private_message_debug_snapshot(page, diag)
        raise RuntimeError(f"点击私信后未检测到私信会话窗口：diagnostics={json.dumps(diag, ensure_ascii=False)}")

    def _prepare_profile_private_area(self, page) -> None:
        """Stabilize the user-profile action area before clicking.

        Douyin may mount the "下载电脑客户端" promo a few seconds after the profile header
        appears. That module shifts the action button group, so clicking a cached coordinate
        is unreliable. We wait for the profile action group and make the promo non-interactive
        while keeping layout intact, then wait for the button rect to settle.
        """
        try:
            page.evaluate(
                """
                () => {
                  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
                  for (const el of document.querySelectorAll('.ENzcCbld, .us5NpvPO, [class*="Download"], [class*="download"]')) {
                    const text = norm(el.innerText || el.textContent || '');
                    if (/下载电脑客户端|桌面快捷访问|下载抖音/.test(text)) {
                      el.style.pointerEvents = 'none';
                    }
                  }
                }
                """
            )
        except Exception:
            pass
        try:
            self._wait_any_visible(page, ["text=关注", "text=私信", ".csTRSiPn", ".gNqMqxqn"], timeout=12000, raise_on_timeout=False)
        except Exception:
            pass
        page.wait_for_timeout(900)

    def _mouse_click_profile_private_entry(self, page, timeout: int = 36000) -> Dict[str, Any]:
        deadline = time.monotonic() + max(3, timeout / 1000)
        last_error: str = "no_candidate"
        while time.monotonic() < deadline:
            self._prepare_profile_private_area(page)
            candidate1 = self._find_profile_private_entry_point(page)
            if not candidate1.get("ok"):
                last_error = str(candidate1.get("reason") or "no_candidate")
                page.wait_for_timeout(500)
                continue
            page.wait_for_timeout(1000)
            candidate2 = self._find_profile_private_entry_point(page)
            if not candidate2.get("ok"):
                last_error = str(candidate2.get("reason") or "candidate_disappeared")
                page.wait_for_timeout(500)
                continue
            if not self._is_same_rect(candidate1.get("rect"), candidate2.get("rect"), tolerance=7):
                print(f"[CLICK] 私信入口位置仍在变化，继续等待：before={candidate1.get('rect')} after={candidate2.get('rect')}")
                page.wait_for_timeout(650)
                continue
            try:
                x = float(candidate2.get("x"))
                y = float(candidate2.get("y"))
            except Exception:
                last_error = "bad_candidate_coordinate"
                page.wait_for_timeout(500)
                continue
            try:
                page.mouse.move(x, y)
                page.wait_for_timeout(random.randint(120, 260))
                page.mouse.down()
                page.wait_for_timeout(random.randint(80, 160))
                page.mouse.up()
                return candidate2
            except Exception as exc:
                last_error = str(exc)
                page.wait_for_timeout(500)
        raise RuntimeError(f"资料区私信入口鼠标点击超时：{last_error}")

    def _find_profile_private_entry_point(self, page) -> Dict[str, Any]:
        script = """
        () => {
          const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
          const visible = el => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width >= 40 && rect.height >= 24;
          };
          const textOf = el => norm(el && (el.innerText || el.textContent || el.getAttribute && el.getAttribute('aria-label') || '') || '');
          const isPrivateText = el => ['私信', '发私信', '发送消息'].includes(textOf(el));
          const isBadArea = el => !!(
            el.closest('#imSaasContainerId, [data-e2e="im-dialog"], [data-e2e="im-entry"], [data-e2e="conversation-item"]') ||
            el.closest('nav, aside, [class*="side" i], [class*="menu" i], [class*="LeftPanel"], [class*="conversation" i]')
          );
          const clickableButton = node => {
            if (!node) return null;
            if (node.matches && node.matches('button, [role="button"], a')) return node;
            const direct = node.closest && node.closest('button, [role="button"], a, .semi-button');
            if (direct) return direct;
            let cur = node;
            for (let i = 0; cur && i < 4; i++, cur = cur.parentElement) {
              const style = cur && window.getComputedStyle(cur);
              const cls = String(cur && cur.className || '');
              if (style && (style.cursor === 'pointer' || /button|btn|semi-button/i.test(cls))) return cur;
            }
            return node;
          };
          const profileActionContainer = el => el && el.closest && el.closest('.csTRSiPn, .gNqMqxqn, .r35zMvOH, [data-e2e="user-info"], [class*="user" i], [class*="User"]');
          const hasFollowNear = el => {
            const nodes = [];
            let cur = el;
            for (let i = 0; cur && i < 6; i++, cur = cur.parentElement) nodes.push(cur);
            const known = profileActionContainer(el);
            if (known) nodes.push(known);
            return nodes.filter(Boolean).some(node => {
              const t = norm(node.innerText || node.textContent || '');
              return /关注|已关注|相互关注/.test(t) || !!node.querySelector('[data-e2e="user-info-follow-btn"]');
            });
          };
          const isLikelyProfileHeaderAction = el => {
            const rect = el.getBoundingClientRect();
            if (rect.top < 90 || rect.top > Math.max(360, window.innerHeight * 0.45)) return false;
            if (rect.left < window.innerWidth * 0.45) return false;
            if (isBadArea(el)) return false;
            const nodes = [];
            let cur = el;
            for (let i = 0; cur && i < 5; i++, cur = cur.parentElement) nodes.push(cur);
            return nodes.some(node => {
              const t = norm(node.innerText || node.textContent || '');
              return /关注|已关注|相互关注/.test(t) && /私信|发私信|发送消息/.test(t);
            });
          };
          const cssPath = el => {
            try {
              const parts = [];
              let node = el;
              for (let i = 0; node && node.nodeType === 1 && i < 7; i++, node = node.parentElement) {
                let part = node.tagName.toLowerCase();
                const id = node.id ? '#' + node.id : '';
                const cls = Array.from(node.classList || []).slice(0, 3).join('.');
                if (id) part += id;
                if (cls) part += '.' + cls;
                parts.unshift(part);
              }
              return parts.join(' > ');
            } catch(e) { return ''; }
          };
          const pointHits = el => {
            const rect = el.getBoundingClientRect();
            const points = [
              [rect.left + rect.width / 2, rect.top + rect.height / 2],
              [rect.left + Math.min(rect.width - 4, Math.max(4, rect.width * 0.35)), rect.top + rect.height / 2],
              [rect.left + Math.min(rect.width - 4, Math.max(4, rect.width * 0.65)), rect.top + rect.height / 2],
            ];
            const hits = [];
            for (const [x, y] of points) {
              if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
              const hit = document.elementFromPoint(x, y);
              const ok = !!(hit && (hit === el || el.contains(hit) || hit.contains(el)));
              hits.push({ x, y, ok, hitText: norm(hit && (hit.innerText || hit.textContent || '') || '').slice(0, 30), hitClass: String(hit && hit.className || '') });
            }
            return hits;
          };
          const scoreOf = (el, source) => {
            let score = 100;
            const p = el.parentElement;
            const gp = p && p.parentElement;
            if (p && p.classList && p.classList.contains('csTRSiPn')) score = 0;
            else if (p && p.classList && p.classList.contains('gNqMqxqn')) score = 1;
            else if (gp && gp.classList && (gp.classList.contains('csTRSiPn') || gp.classList.contains('gNqMqxqn'))) score = 2;
            else if (p && p.querySelector('[data-e2e="user-info-follow-btn"]')) score = 6;
            else if (hasFollowNear(el)) score = 10;
            if (source === 'known-profile-action-class') score -= 2;
            return score;
          };
          const candidates = [];
          const add = (raw, source) => {
            const el = clickableButton(raw);
            if (!el || !visible(el) || !isPrivateText(el) || isBadArea(el)) return;
            if (!hasFollowNear(el) && !isLikelyProfileHeaderAction(el)) return;
            if (el.disabled || String(el.getAttribute('aria-disabled') || '').toLowerCase() === 'true') return;
            const rect = el.getBoundingClientRect();
            if (rect.top < 80 || rect.left < 260 || rect.width < 40 || rect.height < 24) return;
            const hits = pointHits(el);
            const firstHit = hits.find(h => h.ok) || hits[0];
            if (!firstHit || !firstHit.ok) return;
            candidates.push({
              el, source, score: scoreOf(el, source),
              text: textOf(el), parentText: norm(el.parentElement && el.parentElement.innerText || ''),
              path: cssPath(el), x: firstHit.x, y: firstHit.y,
              rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
              hits,
            });
          };
          document.querySelectorAll('.csTRSiPn button, .gNqMqxqn button, .csTRSiPn [role="button"], .gNqMqxqn [role="button"], .csTRSiPn .semi-button, .gNqMqxqn .semi-button').forEach(el => add(el, 'known-profile-action-class'));
          document.querySelectorAll('.semi-button-content, .semi-button, [role="button"], button').forEach(el => add(el, 'button-like'));
          Array.from(document.querySelectorAll('div, span, a')).filter(el => isPrivateText(el)).slice(0, 60).forEach(el => add(el, 'text-node-private'));
          candidates.sort((a, b) => a.score - b.score || a.rect.top - b.rect.top || b.rect.left - a.rect.left);
          const chosen = candidates[0];
          if (!chosen) {
            return {
              ok: false,
              reason: 'no_profile_private_button',
              candidatesText: Array.from(document.querySelectorAll('button, [role="button"], .semi-button, .semi-button-content, div, span, a')).map(b => norm(b.innerText || b.textContent || '')).filter(Boolean).filter(t => /私信|关注|登录|下载/.test(t)).slice(0, 80),
              bodyTextSample: norm(document.body && document.body.innerText || '').slice(0, 500),
            };
          }
          try { chosen.el.scrollIntoView({ block: 'center', inline: 'center' }); } catch(e) {}
          return { ok: true, source: chosen.source, text: chosen.text, parentText: chosen.parentText, path: chosen.path, x: chosen.x, y: chosen.y, rect: chosen.rect, hits: chosen.hits };
        }
        """
        try:
            result = page.evaluate(script)
            return result if isinstance(result, dict) else {"ok": False, "reason": "bad_js_result"}
        except Exception as exc:
            return {"ok": False, "reason": f"find_point_failed: {exc}"}

    def _keyboard_activate_profile_private_entry(self, page, timeout: int = 10000) -> Dict[str, Any]:
        deadline = time.monotonic() + max(3, timeout / 1000)
        last_error = "no_candidate"
        while time.monotonic() < deadline:
            handle = None
            try:
                handle = self._find_profile_private_entry_handle(page)
                if handle is None:
                    last_error = "no_handle"
                    page.wait_for_timeout(400)
                    continue
                info = self._element_handle_click_info(handle)
                if not self._is_valid_profile_private_entry_info(info):
                    last_error = f"invalid_handle_info={info}"
                    page.wait_for_timeout(400)
                    continue
                try:
                    handle.scroll_into_view_if_needed(timeout=3000)
                except Exception:
                    pass
                try:
                    handle.focus()
                except Exception:
                    pass
                page.keyboard.press("Enter")
                return {"mode": "keyboard_enter", **info}
            except Exception as exc:
                last_error = str(exc)
                page.wait_for_timeout(400)
            finally:
                try:
                    if handle is not None:
                        handle.dispose()
                except Exception:
                    pass
        raise RuntimeError(f"资料区私信入口键盘激活超时：{last_error}")

    def _is_login_prompt_visible(self, page) -> bool:
        try:
            state = self._detect_douyin_login_state(page)
            return not self._is_private_message_auth_ready(state) and bool(
                state.get("hasLoginModal") or state.get("topLoginButton") or state.get("loginRequired")
            )
        except Exception:
            return False

    def _handle_login_prompt_after_private_click(self, page) -> bool:
        if not self._is_login_prompt_visible(page):
            return False
        if self.options.headless:
            raise RuntimeError("点击私信后出现登录弹窗，但当前是 headless 模式；请设置 ACS_PM_HEADLESS=0 登录一次。")
        print("[AUTH] 点击私信后出现抖音登录弹窗，请在 Playwright 浏览器中完成登录，完成后将重新点击资料区私信。")
        self._wait_for_playwright_login(page, page.url, timeout_sec=300)
        return True

    def _wait_for_message_dialog_any_page(self, page, timeout: int = 30000):
        deadline = time.monotonic() + max(1, timeout / 1000)
        while time.monotonic() < deadline:
            try:
                pages = list(page.context.pages)
            except Exception:
                pages = [page]
            # 新开页优先放后面也能被扫描到；同一页右侧弹窗则直接命中。
            for candidate_page in pages:
                try:
                    if candidate_page.is_closed():
                        continue
                except Exception:
                    pass
                if self._wait_any_visible(candidate_page, self._message_dialog_selectors(), timeout=350, raise_on_timeout=False):
                    return candidate_page
            time.sleep(0.25)
        return None

    def _save_private_message_debug_snapshot(self, page, diag: Dict[str, Any]) -> None:
        try:
            task_no = str(diag.get("taskNo") or int(time.time()))
            debug_dir = self.options.base_dir / "state" / "private_message_debug"
            debug_dir.mkdir(parents=True, exist_ok=True)
            ts = time.strftime("%Y%m%d_%H%M%S")
            html_path = debug_dir / f"pm_fail_{ts}.html"
            json_path = debug_dir / f"pm_fail_{ts}.json"
            png_path = debug_dir / f"pm_fail_{ts}.png"
            try:
                html_path.write_text(page.content(), encoding="utf-8")
            except Exception:
                pass
            try:
                json_path.write_text(json.dumps(diag, ensure_ascii=False, indent=2), encoding="utf-8")
            except Exception:
                pass
            try:
                page.screenshot(path=str(png_path), full_page=True, timeout=5000)
            except Exception:
                pass
            print(f"[DEBUG] 已保存主动私信失败现场：{debug_dir}")
        except Exception:
            pass

    def _native_click_profile_private_entry(self, page, timeout: int = 36000) -> Dict[str, Any]:
        deadline = time.monotonic() + max(3, timeout / 1000)
        last_error: Optional[Exception] = None
        while time.monotonic() < deadline:
            handle = None
            stable_handle = None
            try:
                handle = self._find_profile_private_entry_handle(page)
                if handle is None:
                    page.wait_for_timeout(450)
                    continue
                info1 = self._element_handle_click_info(handle)
                if not self._is_valid_profile_private_entry_info(info1):
                    page.wait_for_timeout(450)
                    continue

                # 等待按钮布局稳定。资料区右侧“下载电脑客户端”模块会延迟挂载，可能把私信按钮横向挤动。
                page.wait_for_timeout(1200)
                stable_handle = self._find_profile_private_entry_handle(page)
                if stable_handle is None:
                    page.wait_for_timeout(450)
                    continue
                info2 = self._element_handle_click_info(stable_handle)
                if not self._is_valid_profile_private_entry_info(info2):
                    page.wait_for_timeout(450)
                    continue
                if not self._is_same_rect(info1.get("rect"), info2.get("rect"), tolerance=6):
                    print(f"[CLICK] 私信入口位置仍在变化，继续等待：before={info1.get('rect')} after={info2.get('rect')}")
                    page.wait_for_timeout(650)
                    continue

                stable_handle.scroll_into_view_if_needed(timeout=4000)
                page.wait_for_timeout(250)
                stable_handle.hover(timeout=4000)
                stable_handle.click(timeout=9000, trial=True)
                stable_handle.click(timeout=9000)
                return {"mode": "element_handle", **info2}
            except Exception as exc:
                last_error = exc
                page.wait_for_timeout(450)
            finally:
                for item in (handle, stable_handle):
                    try:
                        if item is not None:
                            item.dispose()
                    except Exception:
                        pass
        raise RuntimeError(f"原生资料区私信入口等待/点击超时：{last_error}")

    def _find_profile_private_entry_handle(self, page):
        script = """
        () => {
          const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
          const visible = el => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width >= 40 && rect.height >= 24;
          };
          const textOf = el => norm(el && (el.innerText || el.textContent || el.getAttribute && el.getAttribute('aria-label') || '') || '');
          const isPrivateText = el => ['私信', '发私信', '发送消息'].includes(textOf(el));
          const badArea = el => !!(
            el.closest('#imSaasContainerId, [data-e2e="im-dialog"], [data-e2e="im-entry"], [data-e2e="conversation-item"]') ||
            el.closest('nav, aside, [class*="side" i], [class*="menu" i], [class*="LeftPanel"], [class*="conversation" i]')
          );
          const profileActionContainer = el => el && el.closest && el.closest('.csTRSiPn, .gNqMqxqn, .r35zMvOH, [data-e2e="user-info"], [class*="user" i], [class*="User"]');
          const hasFollowNear = el => {
            const nodes = [];
            let cur = el;
            for (let i = 0; cur && i < 6; i++, cur = cur.parentElement) nodes.push(cur);
            const known = profileActionContainer(el);
            if (known) nodes.push(known);
            return nodes.filter(Boolean).some(node => {
              const t = norm(node.innerText || node.textContent || '');
              return /关注|已关注|相互关注/.test(t) || !!node.querySelector('[data-e2e="user-info-follow-btn"]');
            });
          };
          const isLikelyProfileHeaderAction = el => {
            const rect = el.getBoundingClientRect();
            if (rect.top < 90 || rect.top > Math.max(360, window.innerHeight * 0.45)) return false;
            if (rect.left < window.innerWidth * 0.45) return false;
            if (badArea(el)) return false;
            const nodes = [];
            let cur = el;
            for (let i = 0; cur && i < 5; i++, cur = cur.parentElement) nodes.push(cur);
            return nodes.some(node => {
              const t = norm(node.innerText || node.textContent || '');
              return /关注|已关注|相互关注/.test(t) && /私信|发私信|发送消息/.test(t);
            });
          };
          const relationScore = el => {
            const p = el.parentElement;
            const gp = p && p.parentElement;
            if (p && p.classList && (p.classList.contains('csTRSiPn') || p.classList.contains('gNqMqxqn'))) return 0;
            if (gp && gp.classList && (gp.classList.contains('csTRSiPn') || gp.classList.contains('gNqMqxqn'))) return 1;
            if (p && p.querySelector('[data-e2e="user-info-follow-btn"]')) return 5;
            if (hasFollowNear(el)) return 8;
            if (isLikelyProfileHeaderAction(el)) return 12;
            return 99;
          };
          const clickableButton = node => {
            if (!node) return null;
            if (node.matches && node.matches('button, [role="button"], a')) return node;
            const direct = node.closest && node.closest('button, [role="button"], a, .semi-button');
            if (direct) return direct;
            let cur = node;
            for (let i = 0; cur && i < 4; i++, cur = cur.parentElement) {
              const style = cur && window.getComputedStyle(cur);
              const cls = String(cur && cur.className || '');
              if (style && (style.cursor === 'pointer' || /button|btn|semi-button/i.test(cls))) return cur;
            }
            return node;
          };
          const candidates = [];
          const add = (raw, source) => {
            const el = clickableButton(raw);
            if (!el || !visible(el) || !isPrivateText(el) || badArea(el)) return;
            if (!hasFollowNear(el) && !isLikelyProfileHeaderAction(el)) return;
            if (el.disabled || String(el.getAttribute('aria-disabled') || '').toLowerCase() === 'true') return;
            const rect = el.getBoundingClientRect();
            if (rect.top < 80 || rect.left < 260) return;
            const score = relationScore(el);
            if (score >= 99) return;
            candidates.push({ el, score, source, left: rect.left, top: rect.top, area: rect.width * rect.height });
          };
          document.querySelectorAll('.csTRSiPn button, .gNqMqxqn button, .csTRSiPn [role="button"], .gNqMqxqn [role="button"], .csTRSiPn .semi-button, .gNqMqxqn .semi-button').forEach(el => add(el, 'known-profile-action-class'));
          document.querySelectorAll('button, [role="button"], .semi-button, .semi-button-content').forEach(el => add(el, 'button-like'));
          Array.from(document.querySelectorAll('div, span, a')).filter(el => isPrivateText(el)).slice(0, 60).forEach(el => add(el, 'text-node-private'));
          candidates.sort((a, b) => a.score - b.score || a.top - b.top || a.left - b.left || b.area - a.area);
          return candidates.length ? candidates[0].el : null;
        }
        """
        try:
            js_handle = page.evaluate_handle(script)
            element = js_handle.as_element()
            if element is None:
                try:
                    js_handle.dispose()
                except Exception:
                    pass
                return None
            return element
        except Exception as exc:
            print(f"[CLICK] 查找资料区私信 ElementHandle 失败：{exc}")
            return None

    def _element_handle_click_info(self, element) -> Dict[str, Any]:
        try:
            return element.evaluate(
                """
                (el) => {
                  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
                  const rect = el.getBoundingClientRect();
                  const parent = el.parentElement;
                  const grand = parent && parent.parentElement;
                  const parentText = norm(parent && parent.innerText || '');
                  const grandText = norm(grand && grand.innerText || '');
                  const text = norm(el.innerText || el.textContent || el.getAttribute('aria-label') || '');
                  const hasSiblingFollow = !!(parent && Array.from(parent.children || []).some(child => child !== el && /关注/.test(norm(child.innerText || child.textContent || ''))));
                  const hasParentFollowButton = !!(parent && parent.querySelector('[data-e2e="user-info-follow-btn"]'));
                  const hasGrandFollowButton = !!(grand && grand.querySelector('[data-e2e="user-info-follow-btn"]'));
                  const inGlobalImEntry = !!el.closest('[data-e2e="im-entry"]');
                  const inImDialog = !!el.closest('#imSaasContainerId, [data-e2e="im-dialog"], [data-e2e="conversation-item"]');
                  const inLeftNav = !!el.closest('nav, aside, [class*="side" i], [class*="menu" i], [class*="LeftPanel"], [class*="conversation" i]');
                  const path = (() => {
                    try {
                      const parts = [];
                      let node = el;
                      for (let i = 0; node && node.nodeType === 1 && i < 6; i++, node = node.parentElement) {
                        let part = node.tagName.toLowerCase();
                        const cls = Array.from(node.classList || []).slice(0, 3).join('.');
                        if (cls) part += '.' + cls;
                        parts.unshift(part);
                      }
                      return parts.join(' > ');
                    } catch(e) { return ''; }
                  })();
                  return {
                    text,
                    parentText,
                    grandText,
                    hasSiblingFollow,
                    hasParentFollowButton,
                    hasGrandFollowButton,
                    inGlobalImEntry,
                    inImDialog,
                    inLeftNav,
                    className: String(el.className || ''),
                    path,
                    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
                  };
                }
                """
            )
        except Exception:
            return {}

    def _click_profile_private_entry(self, page, timeout: int = 28000) -> Dict[str, Any]:
        deadline = time.monotonic() + max(3, timeout / 1000)
        candidate_selectors = [
            # 精准命中已知资料区类名。
            "xpath=//div[contains(concat(' ', normalize-space(@class), ' '), ' csTRSiPn ') or contains(concat(' ', normalize-space(@class), ' '), ' gNqMqxqn ')]//button[normalize-space(.)='私信' or normalize-space(.)='发私信' or normalize-space(.)='发送消息']",
            # 泛化：button 文案是私信，并且前后兄弟节点里有关注按钮。
            "xpath=//button[not(ancestor::*[@data-e2e='im-entry']) and (normalize-space(.)='私信' or normalize-space(.)='发私信' or normalize-space(.)='发送消息') and (preceding-sibling::button[contains(normalize-space(.), '关注') or @data-e2e='user-info-follow-btn'] or following-sibling::button[contains(normalize-space(.), '关注') or @data-e2e='user-info-follow-btn'])]",
            # 泛化：父容器内同时有关注按钮和私信按钮。
            "xpath=//button[not(ancestor::*[@data-e2e='im-entry']) and (normalize-space(.)='私信' or normalize-space(.)='发私信' or normalize-space(.)='发送消息') and parent::*[.//button[@data-e2e='user-info-follow-btn' or contains(normalize-space(.), '关注')]]]",
            # 兼容 Semi 内容结构。
            "xpath=//*[not(ancestor::*[@data-e2e='im-entry']) and contains(concat(' ', normalize-space(@class), ' '), ' semi-button-content ') and (normalize-space(.)='私信' or normalize-space(.)='发私信' or normalize-space(.)='发送消息')]/ancestor::button[1][parent::*[.//button[@data-e2e='user-info-follow-btn' or contains(normalize-space(.), '关注')]]]",
        ]
        last_error: Optional[Exception] = None
        while time.monotonic() < deadline:
            for selector in candidate_selectors:
                try:
                    locator = page.locator(selector)
                    try:
                        count = min(locator.count(), 6)
                    except Exception:
                        count = 1
                    for index in range(count):
                        candidate = locator.nth(index)
                        try:
                            if not candidate.is_visible(timeout=500):
                                continue
                            info1 = self._locator_click_info(candidate)
                            if not self._is_valid_profile_private_entry_info(info1):
                                continue
                            # 等待布局稳定，避免“下载电脑客户端”浮层后挂载导致按钮横向移动。
                            page.wait_for_timeout(900)
                            if not candidate.is_visible(timeout=500):
                                continue
                            info2 = self._locator_click_info(candidate)
                            if not self._is_valid_profile_private_entry_info(info2):
                                continue
                            if not self._is_same_rect(info1.get("rect"), info2.get("rect"), tolerance=8):
                                print(f"[CLICK] 私信入口位置仍在变化，继续等待：before={info1.get('rect')} after={info2.get('rect')}")
                                continue
                            candidate.scroll_into_view_if_needed(timeout=3000)
                            candidate.click(timeout=6000, trial=True)
                            candidate.click(timeout=6000)
                            return {"selector": selector, "index": index, **info2}
                        except Exception as exc:
                            last_error = exc
                            continue
                except Exception as exc:
                    last_error = exc
            page.wait_for_timeout(450)
        raise RuntimeError(f"资料区私信入口等待超时：{last_error}")

    def _locator_click_info(self, locator) -> Dict[str, Any]:
        try:
            return locator.evaluate(
                """
                (el) => {
                  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
                  const rect = el.getBoundingClientRect();
                  const parent = el.parentElement;
                  const parentText = norm(parent && parent.innerText || '');
                  const text = norm(el.innerText || el.textContent || el.getAttribute('aria-label') || '');
                  const hasSiblingFollow = !!(parent && Array.from(parent.children || []).some(child => child !== el && /关注/.test(norm(child.innerText || child.textContent || ''))));
                  const hasParentFollowButton = !!(parent && parent.querySelector('[data-e2e="user-info-follow-btn"]'));
                  const inGlobalImEntry = !!el.closest('[data-e2e="im-entry"]');
                  const inLeftNav = !!el.closest('nav, aside, [class*="side" i], [class*="menu" i]');
                  return {
                    text,
                    parentText,
                    hasSiblingFollow,
                    hasParentFollowButton,
                    inGlobalImEntry,
                    inLeftNav,
                    className: String(el.className || ''),
                    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
                  };
                }
                """
            )
        except Exception:
            return {}

    def _is_valid_profile_private_entry_info(self, info: Dict[str, Any]) -> bool:
        rect = info.get("rect") if isinstance(info, dict) else None
        if not isinstance(rect, dict):
            return False
        text = str(info.get("text") or "").strip()
        parent_text = str(info.get("parentText") or "")
        grand_text = str(info.get("grandText") or "")
        if text not in {"私信", "发私信", "发送消息"}:
            return False
        if info.get("inGlobalImEntry") or info.get("inLeftNav") or info.get("inImDialog"):
            return False
        try:
            left = float(rect.get("left") or 0)
            top = float(rect.get("top") or 0)
            width = float(rect.get("width") or 0)
            height = float(rect.get("height") or 0)
        except Exception:
            return False
        if width < 24 or height < 20:
            return False
        # 顶部全局私信入口通常在页面最上方；资料区按钮在头像/昵称区域附近。
        if top < 80:
            return False
        if left < 260:
            return False
        return bool(
            info.get("hasSiblingFollow")
            or info.get("hasParentFollowButton")
            or info.get("hasGrandFollowButton")
            or "关注" in parent_text
            or "关注" in grand_text
        )

    def _is_same_rect(self, before: Any, after: Any, tolerance: float = 8) -> bool:
        if not isinstance(before, dict) or not isinstance(after, dict):
            return False
        for key in ("left", "top", "width", "height"):
            try:
                if abs(float(before.get(key) or 0) - float(after.get(key) or 0)) > tolerance:
                    return False
            except Exception:
                return False
        return True

    def _message_dialog_selectors(self) -> list[str]:
        # 参考你提供的“点击私信出现的弹窗模块”outerHTML：
        # 根容器为 data-e2e=im-dialog / #imSaasContainerId，输入区为 data-e2e=msg-input，
        # 具体编辑器是 data-slate-editor=true + contenteditable=true。
        return [
            "[data-e2e='im-dialog']",
            "#imSaasContainerId",
            "[class*='componentsEntrywrapper']",
            ".imContainer",
            "[data-e2e='msg-input']",
            "[data-slate-editor='true'][contenteditable='true']",
            "[data-placeholder='发送消息']",
        ]

    def _wait_for_message_dialog(self, page):
        dialog_page = self._wait_for_message_dialog_any_page(page, timeout=45000)
        if dialog_page:
            return dialog_page
        diag = self._collect_page_diagnostics(page)
        self._save_private_message_debug_snapshot(page, diag)
        raise RuntimeError(f"点击私信后未检测到私信会话窗口：diagnostics={json.dumps(diag, ensure_ascii=False)}")

    def _is_message_dialog_visible(self, page) -> bool:
        return self._wait_any_visible(page, self._message_dialog_selectors(), timeout=800, raise_on_timeout=False)

    def _fill_message_input(self, page, message: str) -> str:
        selectors = [
            "[data-slate-editor='true'][contenteditable='true']",
            "[data-placeholder='发送消息'][contenteditable='true']",
            ".messageEditorinputArea[contenteditable='true']",
            "[contenteditable='true'][role='textbox']",
            "div[role='textbox']",
            "[contenteditable='true']",
            "textarea",
        ]
        try:
            return self._fill_first(page, selectors, message, timeout=10000)
        except Exception as selector_exc:
            print(f"[INPUT] 常规选择器未命中私信输入框，准备使用 DOM 兜底：{selector_exc}")
        result = self._js_fill_message_input(page, message)
        if result:
            print(f"[INPUT] 已通过 DOM 兜底写入私信内容：{result}")
            return "dom_fallback"
        diag = self._collect_page_diagnostics(page)
        raise RuntimeError(f"未找到可输入的私信文本框：diagnostics={json.dumps(diag, ensure_ascii=False)}")

    def _click_send_button(self, page) -> None:
        selectors = [
            ".messageMsgInputinputAction .e2e-send-msg-btn",
            "[class*='messageMsgInputinputAction'] [class*='messageMsgInputpublishBtn']",
            "[class*='messageMsgInputpublishBtn']",
            ".e2e-send-msg-btn",
            "svg.e2e-send-msg-btn",
            "button:has-text('发送')",
            "[aria-label*='发送']",
            "text=发送",
        ]
        try:
            self._click_first(page, selectors, timeout=12000, label="发送按钮")
            return
        except Exception as selector_exc:
            print(f"[CLICK] 常规选择器未命中发送按钮，准备使用 DOM 兜底：{selector_exc}")
        clicked = self._js_click_send_button(page)
        if clicked:
            print(f"[CLICK] 已通过 DOM 兜底点击发送按钮：{clicked}")
            return
        diag = self._collect_page_diagnostics(page)
        raise RuntimeError(f"未找到可点击的发送按钮：diagnostics={json.dumps(diag, ensure_ascii=False)}")

    def _js_click_profile_private_entry(self, page) -> Dict[str, Any]:
        script = """
        () => {
          const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
          const visible = el => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 24 && rect.height > 20;
          };
          const cssPath = el => {
            try {
              if (!el) return '';
              if (el.id) return '#' + el.id;
              const parts = [];
              let node = el;
              for (let i = 0; node && node.nodeType === 1 && i < 6; i++, node = node.parentElement) {
                let part = node.tagName.toLowerCase();
                const data = node.getAttribute && (node.getAttribute('data-e2e') || node.getAttribute('aria-label'));
                if (data) part += `[${data}]`;
                const cls = Array.from(node.classList || []).slice(0, 2).join('.');
                if (cls) part += '.' + cls;
                parts.unshift(part);
              }
              return parts.join(' > ');
            } catch (e) { return ''; }
          };
          const isGlobalOrNav = el => !!(el.closest('[data-e2e="im-entry"]') || el.closest('nav, aside, [class*="side" i], [class*="menu" i]'));
          const hasSiblingFollow = el => {
            const p = el && el.parentElement;
            if (!p) return false;
            return Array.from(p.children || []).some(child => child !== el && /关注/.test(norm(child.innerText || child.textContent || '')));
          };
          const buttonTextOk = el => ['私信', '发私信', '发送消息'].includes(norm(el.innerText || el.textContent || el.getAttribute('aria-label') || ''));
          const candidates = [];
          const add = (el, priority, reason) => {
            if (!el || !visible(el) || isGlobalOrNav(el) || !buttonTextOk(el)) return;
            const rect = el.getBoundingClientRect();
            if (rect.top < 80 || rect.left < 260) return;
            const parentText = norm(el.parentElement && el.parentElement.innerText || '');
            const siblingFollow = hasSiblingFollow(el) || !!(el.parentElement && el.parentElement.querySelector('[data-e2e="user-info-follow-btn"]'));
            if (!siblingFollow && !/关注/.test(parentText)) return;
            candidates.push({ el, priority, reason, text: norm(el.innerText || el.textContent || ''), left: rect.left, top: rect.top, width: rect.width, height: rect.height });
          };
          Array.from(document.querySelectorAll('.csTRSiPn button, .gNqMqxqn button')).forEach(el => add(el, 1, 'known-profile-class'));
          Array.from(document.querySelectorAll('button')).forEach(el => add(el, 10, 'sibling-follow-button'));
          Array.from(document.querySelectorAll('.semi-button-content')).forEach(span => {
            const button = span.closest('button');
            if (button) add(button, 15, 'semi-button-content');
          });
          candidates.sort((a, b) => a.priority - b.priority || a.top - b.top || b.left - a.left);
          const chosen = candidates[0];
          if (!chosen) {
            return {
              ok: false,
              reason: 'profile_private_entry_not_found',
              currentUrl: location.href,
              title: document.title,
              hasPrivateText: norm(document.body && document.body.innerText || '').includes('私信'),
              bodyTextSample: norm(document.body && document.body.innerText || '').slice(0, 700),
            };
          }
          const el = chosen.el;
          try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
          const rect = el.getBoundingClientRect();
          const x = rect.left + Math.max(4, Math.min(rect.width - 4, rect.width / 2));
          const y = rect.top + Math.max(4, Math.min(rect.height - 4, rect.height / 2));
          try {
            ['mouseover', 'mouseenter', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach(type => {
              el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }));
            });
          } catch (e) {}
          try { el.click && el.click(); } catch (e) {}
          return { ok: true, reason: chosen.reason, text: chosen.text, path: cssPath(el), x, y, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
        }
        """
        try:
            result = page.evaluate(script)
            return result if isinstance(result, dict) and result.get("ok") else {}
        except Exception as exc:
            print(f"[CLICK] DOM 资料区私信兜底执行失败：{exc}")
            return {}

    def _js_click_by_text(self, page, texts: Iterable[str], label: str = "按钮") -> Dict[str, Any]:
        script = """
        (texts) => {
          const wanted = (texts || []).map(t => String(t || '').trim()).filter(Boolean);
          const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
          const visible = el => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            if (!style || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 2 && rect.height > 2;
          };
          const cssPath = el => {
            try {
              if (!el) return '';
              if (el.id) return '#' + el.id;
              const parts = [];
              let node = el;
              for (let i = 0; node && node.nodeType === 1 && i < 5; i++, node = node.parentElement) {
                let part = node.tagName.toLowerCase();
                const cls = Array.from(node.classList || []).slice(0, 3).join('.');
                if (cls) part += '.' + cls;
                parts.unshift(part);
              }
              return parts.join(' > ');
            } catch (e) { return ''; }
          };
          const isBadGlobalNav = el => {
            try {
              const txt = norm(el.innerText || el.textContent || '');
              const rect = el.getBoundingClientRect();
              const parentText = norm((el.closest('nav, aside, [class*="side" i], [class*="menu" i]') || {}).innerText || '');
              // 抖音左侧导航的“私信”通常在很靠左位置，并且父级包含多项导航文案。主页资料区的按钮在头部中间/右侧。
              if (rect.left < 260 && /精选|推荐|关注|朋友|我的|直播|放映厅|短剧|小游戏|私信/.test(parentText)) return true;
            } catch (e) {}
            return false;
          };
          const clickableAncestor = el => {
            let node = el;
            for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
              if (!visible(node)) continue;
              const tag = (node.tagName || '').toLowerCase();
              const role = node.getAttribute && String(node.getAttribute('role') || '').toLowerCase();
              const ariaDisabled = node.getAttribute && String(node.getAttribute('aria-disabled') || '').toLowerCase();
              const disabled = node.disabled || ariaDisabled === 'true';
              const cursor = window.getComputedStyle(node).cursor;
              if (!disabled && (tag === 'button' || tag === 'a' || role === 'button' || cursor === 'pointer' || /button|btn/i.test(String(node.className || '')))) {
                return node;
              }
            }
            return el;
          };
          const exactText = el => wanted.includes(norm(el.innerText || el.textContent || ''));
          const candidates = [];
          const push = (el, priority) => {
            if (!el || !exactText(el) || !visible(el) || isBadGlobalNav(el)) return;
            const clickable = clickableAncestor(el);
            if (!clickable || !visible(clickable) || isBadGlobalNav(clickable)) return;
            const rect = clickable.getBoundingClientRect();
            candidates.push({ el: clickable, source: el, priority, left: rect.left, top: rect.top, area: rect.width * rect.height });
          };
          Array.from(document.querySelectorAll('button')).forEach(el => push(el, 10));
          Array.from(document.querySelectorAll('[role="button"], a, [aria-label]')).forEach(el => push(el, 20));
          Array.from(document.querySelectorAll('span, p, div')).forEach(el => {
            const text = norm(el.innerText || el.textContent || '');
            if (text.length <= 12) push(el, 30);
          });
          candidates.sort((a, b) => a.priority - b.priority || b.left - a.left || a.top - b.top || a.area - b.area);
          const chosen = candidates[0];
          if (!chosen) {
            return { ok: false, reason: 'no_candidate', bodyTextSample: norm(document.body && document.body.innerText || '').slice(0, 500) };
          }
          const el = chosen.el;
          try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
          const rect = el.getBoundingClientRect();
          const x = rect.left + Math.max(2, Math.min(rect.width - 2, rect.width / 2));
          const y = rect.top + Math.max(2, Math.min(rect.height - 2, rect.height / 2));
          try {
            ['mouseover', 'mouseenter', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach(type => {
              el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }));
            });
          } catch (e) {}
          try { el.click && el.click(); } catch (e) {}
          return { ok: true, text: norm(chosen.source.innerText || chosen.source.textContent || ''), tag: el.tagName, path: cssPath(el), x, y };
        }
        """
        try:
            result = page.evaluate(script, list(texts))
            return result if isinstance(result, dict) and result.get("ok") else {}
        except Exception as exc:
            print(f"[CLICK] DOM 文本兜底执行失败：label={label} error={exc}")
            return {}

    def _js_fill_message_input(self, page, message: str) -> Dict[str, Any]:
        script = """
        (message) => {
          const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
          const visible = el => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 4 && rect.height > 4;
          };
          const selectors = [
            '[data-slate-editor="true"][contenteditable="true"]',
            '[data-placeholder="发送消息"][contenteditable="true"]',
            '.messageEditorinputArea[contenteditable="true"]',
            '[contenteditable="true"][role="textbox"]',
            'div[role="textbox"]',
            '[contenteditable="true"]',
            'textarea'
          ];
          let input = null;
          let selector = '';
          for (const sel of selectors) {
            const nodes = Array.from(document.querySelectorAll(sel)).filter(visible);
            if (nodes.length) { input = nodes[0]; selector = sel; break; }
          }
          if (!input) return { ok: false, reason: 'no_input' };
          try { input.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
          try { input.focus(); } catch (e) {}
          if ((input.tagName || '').toLowerCase() === 'textarea' || (input.tagName || '').toLowerCase() === 'input') {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.value = String(message || '');
            input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(message || '') }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return { ok: true, selector, mode: 'value', len: String(message || '').length };
          }
          try {
            const range = document.createRange();
            range.selectNodeContents(input);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand('delete', false, null);
          } catch (e) {
            try { input.innerHTML = ''; } catch (_) {}
          }
          let inserted = false;
          try { inserted = document.execCommand('insertText', false, String(message || '')); } catch (e) { inserted = false; }
          if (!inserted) {
            try { input.textContent = String(message || ''); } catch (e) {}
          }
          try { input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(message || '') })); } catch (e) { input.dispatchEvent(new Event('input', { bubbles: true })); }
          try { input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Process' })); } catch (e) {}
          return { ok: true, selector, mode: inserted ? 'execCommand' : 'textContent', len: norm(input.innerText || input.textContent || input.value || '').length };
        }
        """
        try:
            result = page.evaluate(script, message)
            return result if isinstance(result, dict) and result.get("ok") else {}
        except Exception as exc:
            print(f"[INPUT] DOM 兜底写入失败：{exc}")
            return {}

    def _js_click_send_button(self, page) -> Dict[str, Any]:
        script = """
        () => {
          const visible = el => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 2 && rect.height > 2;
          };
          const cssPath = el => {
            try {
              if (el.id) return '#' + el.id;
              const parts = [];
              let node = el;
              for (let i = 0; node && node.nodeType === 1 && i < 5; i++, node = node.parentElement) {
                let part = node.tagName.toLowerCase();
                const cls = Array.from(node.classList || []).slice(0, 3).join('.');
                if (cls) part += '.' + cls;
                parts.unshift(part);
              }
              return parts.join(' > ');
            } catch (e) { return ''; }
          };
          const clickableAncestor = el => {
            let node = el;
            for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
              if (!visible(node)) continue;
              const tag = (node.tagName || '').toLowerCase();
              const role = node.getAttribute && String(node.getAttribute('role') || '').toLowerCase();
              const disabled = node.disabled || String(node.getAttribute && node.getAttribute('aria-disabled') || '').toLowerCase() === 'true';
              const cursor = window.getComputedStyle(node).cursor;
              if (!disabled && (tag === 'button' || role === 'button' || cursor === 'pointer' || /publishBtn|send|button|btn/i.test(String(node.className || '')))) return node;
            }
            return el;
          };
          const selectors = [
            '.messageMsgInputinputAction .e2e-send-msg-btn',
            '[class*="messageMsgInputinputAction"] [class*="messageMsgInputpublishBtn"]',
            '[class*="messageMsgInputpublishBtn"]',
            '.e2e-send-msg-btn',
            'svg.e2e-send-msg-btn',
            'button[aria-label*="发送"]',
            'button'
          ];
          const candidates = [];
          for (const sel of selectors) {
            Array.from(document.querySelectorAll(sel)).forEach(el => {
              const text = String(el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim();
              const className = String(el.className || '');
              if (sel === 'button' && !/发送|send|publish/i.test(text + ' ' + className)) return;
              const clickable = clickableAncestor(el);
              if (!visible(clickable)) return;
              const rect = clickable.getBoundingClientRect();
              candidates.push({ el: clickable, selector: sel, area: rect.width * rect.height, right: rect.right, bottom: rect.bottom });
            });
            if (candidates.length) break;
          }
          candidates.sort((a, b) => b.right - a.right || b.bottom - a.bottom || a.area - b.area);
          const chosen = candidates[0];
          if (!chosen) return { ok: false, reason: 'no_send_candidate' };
          const el = chosen.el;
          try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
          const rect = el.getBoundingClientRect();
          const x = rect.left + Math.max(2, Math.min(rect.width - 2, rect.width / 2));
          const y = rect.top + Math.max(2, Math.min(rect.height - 2, rect.height / 2));
          try {
            ['mouseover', 'mouseenter', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach(type => {
              el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }));
            });
          } catch (e) {}
          try { el.click && el.click(); } catch (e) {}
          return { ok: true, selector: chosen.selector, tag: el.tagName, path: cssPath(el), x, y };
        }
        """
        try:
            result = page.evaluate(script)
            return result if isinstance(result, dict) and result.get("ok") else {}
        except Exception as exc:
            print(f"[CLICK] DOM 兜底发送执行失败：{exc}")
            return {}

    def _click_first(self, page, selectors: Iterable[str], timeout: int, label: str = "按钮") -> str:
        last_error: Optional[Exception] = None
        per_selector_timeout = max(1500, min(timeout, 5000))
        for selector in selectors:
            try:
                locator = page.locator(selector)
                try:
                    count = min(locator.count(), 8)
                except Exception:
                    count = 1
                if count <= 0:
                    try:
                        locator.first.wait_for(state="attached", timeout=per_selector_timeout)
                        count = 1
                    except Exception as exc:
                        last_error = exc
                        continue
                for index in range(count):
                    candidate = locator.nth(index)
                    try:
                        candidate.wait_for(state="visible", timeout=per_selector_timeout)
                        candidate.scroll_into_view_if_needed(timeout=per_selector_timeout)
                        candidate.click(timeout=per_selector_timeout)
                        print(f"[CLICK] 已点击{label}：selector={selector} index={index}")
                        return selector
                    except Exception as exc:
                        last_error = exc
                        continue
            except Exception as exc:
                last_error = exc
        raise RuntimeError(f"未找到可点击的{label}：{last_error}")

    def _fill_first(self, page, selectors: Iterable[str], text: str, timeout: int) -> str:
        last_error: Optional[Exception] = None
        for selector in selectors:
            try:
                locator = page.locator(selector).first
                locator.click(timeout=min(timeout, 3000))
                try:
                    locator.fill(text, timeout=timeout)
                except Exception:
                    # 抖音 IM 的输入框是 Slate contenteditable，部分版本 fill 不稳定，兜底用键盘输入。
                    page.keyboard.press("Control+A")
                    page.keyboard.type(text, delay=12)
                return selector
            except PlaywrightTimeoutError as exc:
                last_error = exc
            except Exception as exc:
                last_error = exc
        raise RuntimeError(f"未找到可输入的私信文本框：{last_error}")

    def _wait_any_visible(self, page, selectors: Iterable[str], timeout: int, raise_on_timeout: bool = True) -> bool:
        deadline = time.monotonic() + max(0.5, timeout / 1000)
        last_error: Optional[Exception] = None
        while time.monotonic() < deadline:
            for selector in selectors:
                try:
                    locator = page.locator(selector).first
                    if locator.is_visible(timeout=300):
                        return True
                except Exception as exc:
                    last_error = exc
            page.wait_for_timeout(300)
        if raise_on_timeout:
            raise RuntimeError(f"页面未出现目标元素，可能没有进入目标用户主页或页面未加载完成：{last_error}")
        return False

    def _collect_page_diagnostics(self, page) -> Dict[str, Any]:
        info: Dict[str, Any] = {}
        try:
            info["currentUrl"] = page.url
        except Exception:
            pass
        try:
            info["title"] = page.title()
        except Exception:
            pass
        for name, selector in {
            "hasPrivateText": "text=私信",
            "hasPrivateButton": "button:has-text('私信')",
            "hasProfilePrivateButton": ".csTRSiPn button:has-text('私信')",
            "hasFollowText": "text=关注",
            "hasImDialog": "[data-e2e='im-dialog']",
            "hasImContainer": "#imSaasContainerId",
            "hasSlateEditor": "[data-slate-editor='true'][contenteditable='true']",
            "hasSendButton": ".e2e-send-msg-btn",
        }.items():
            try:
                info[name] = page.locator(selector).first.is_visible(timeout=300)
            except Exception:
                info[name] = False
        try:
            info["bodyTextSample"] = page.evaluate(r"() => (document.body && document.body.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 800)")
        except Exception:
            pass
        return info

    def _emit_target_event(self, event: str, task: Dict[str, Any], url: str, label: str = "", error: str = "") -> None:
        payload: Dict[str, Any] = {
            "event": event,
            "type": "private_message",
            "url": url,
            "label": label or str(task.get("targetNickname") or task.get("targetUserId") or ""),
            "taskId": str(task.get("id") or task.get("taskId") or ""),
            "taskNo": str(task.get("taskNo") or ""),
        }
        if error:
            payload["error"] = error
        try:
            print("[TARGET] " + json.dumps(payload, ensure_ascii=False), flush=True)
        except Exception:
            pass

    def _sleep_before_send(self, config: Dict[str, Any]) -> None:
        min_sec = max(1, int(config.get("minSendIntervalSeconds") or 30))
        max_sec = max(min_sec, int(config.get("maxSendIntervalSeconds") or min_sec))
        delay = random.randint(min_sec, max_sec)
        print(f"[WAIT] 按私信配置等待 {delay} 秒后发送下一条。")
        time.sleep(delay)

    def _config(self, runtime: Dict[str, Any]) -> Dict[str, Any]:
        config = runtime.get("config") if isinstance(runtime, dict) else {}
        return config if isinstance(config, dict) else {}

    def _resolve_target_profile_url(self, task: Dict[str, Any]) -> str:
        target_user_id = self._first_text(task, "targetUserId", "userId", "commentUserId")
        platform = self._first_text(task, "platform") or "DOUYIN"
        explicit_url = self._first_text(task, "targetProfileUrl", "targetUrl", "commentUserProfileUrl", "profileUrl")
        normalized = self._normalize_profile_url(explicit_url, target_user_id, platform)
        if normalized:
            return normalized
        return self._build_profile_url(platform, target_user_id)

    def _normalize_profile_url(self, value: str, target_user_id: str, platform: str) -> str:
        text = (value or "").strip()
        if not text:
            return ""
        if text.startswith("//"):
            return "https:" + text
        if text.startswith("/user/"):
            return "https://www.douyin.com" + text
        if text.startswith("http://") or text.startswith("https://"):
            # 如果后端旧任务把监听账号主页写进 targetProfileUrl，这里不要误用；优先用评论用户 userId 重建。
            if target_user_id and "/user/" in text and target_user_id not in text:
                rebuilt = self._build_profile_url(platform, target_user_id)
                return rebuilt or text
            return text
        return self._build_profile_url(platform, text)

    def _build_profile_url(self, platform: str, user_id: str) -> str:
        uid = (user_id or "").strip()
        if not uid:
            return ""
        if uid.startswith("http://") or uid.startswith("https://"):
            return uid
        if uid.startswith("//"):
            return "https:" + uid
        if uid.startswith("/user/"):
            return "https://www.douyin.com" + uid
        normalized_platform = (platform or "").strip().upper()
        if normalized_platform in ("", "DOUYIN", "DOU_YIN"):
            return "https://www.douyin.com/user/" + parse.quote(uid, safe="")
        return ""

    def _first_text(self, data: Dict[str, Any], *keys: str) -> str:
        for key in keys:
            value = data.get(key)
            if value is None:
                continue
            text = str(value).strip()
            if text:
                return text
        return ""


    def _first_runtime_text(self, data: Dict[str, Any], *keys: str) -> str:
        for key in keys:
            value = data.get(key) if isinstance(data, dict) else None
            if value is None:
                continue
            text = str(value).strip()
            if text:
                return text
        return ""

    def _safe_key(self, *values: object) -> str:
        raw = "_".join(str(value or "").strip() for value in values if str(value or "").strip()) or "private_message"
        return re.sub(r"[^A-Za-z0-9_-]+", "_", raw).strip("_")[:90] or "private_message"
