from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
from pathlib import Path
import sys
import time

from .account_sync_service import AccountSyncService
from .browser_session import BrowserSession
from .core_nexus_client import CoreNexusClient, load_session, save_session
from .network_probe import CommentAPINetworkProbe
from .pacing import DEFAULT_PACING_PROFILE, PACING_PROFILE_CHOICES, build_crawl_pacing_policy
from .private_message_worker import PrivateMessageRuntimeOptions, PrivateMessageWorker
from .playwright_runtime import ensure_playwright_browser, ensure_playwright_browser_with_fallback
from .robot_config import get_schedule_skip_reason, load_intercept_config_file, mark_schedule_completed, normalize_robot_detail
from .robot_runner import InterceptRobotRunner, RobotRunSkipped
from .intercept_recovery import InterceptRunManifest, InterceptStopRequested
from .platform_registry import get_platform_adapter
from .scraper import PlatformScraper
from .selectors import DEFAULT_SELECTORS, load_selectors
from .storage import ResultStore, output_section_dir, safe_path_key
from .sync_resume import (
    ensure_sync_files,
    find_resume_task,
    load_payload_for_task,
    upload_payload_with_state,
)



def _safe_runtime_key(*values: object, fallback: str = "robot") -> str:
    raw = next((str(value).strip() for value in values if str(value or "").strip()), fallback)
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", raw).strip("_")
    safe = safe[:56] if safe else fallback
    digest = hashlib.sha1(raw.encode("utf-8", errors="ignore")).hexdigest()[:10]
    if digest and digest not in safe:
        safe = f"{safe}_{digest}"
    return safe or f"{fallback}_{digest}"



def _normalize_robot_name_key(value: object) -> str:
    text = str(value or "").strip().lower()
    return re.sub(r"\s+", "", text)


def _write_profile_metadata(profile_dir: Path, *, platform: str, robot_id: str, robot_name: str, robot_type: str, account_alias: str = "") -> None:
    try:
        profile_dir.mkdir(parents=True, exist_ok=True)
        path = profile_dir / ".acs_profile_meta.json"
        old = {}
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                old = data
        except Exception:
            old = {}
        old.update({
            "platform": str(platform or ""),
            "robotId": str(robot_id or ""),
            "robotName": str(robot_name or ""),
            "robotNameKey": _normalize_robot_name_key(robot_name),
            "robotType": str(robot_type or ""),
            "accountAlias": str(account_alias or ""),
            "purpose": "intercept_profile" if robot_type == "INTERCEPT" else str(robot_type or ""),
            "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        })
        path.write_text(json.dumps(old, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as exc:
        print(f"[AUTH] WARN 写入 Playwright profile metadata 失败：{profile_dir} error={exc}")

SUPPORTED = ["douyin"]  # Other selector presets are unimplemented experiments.


def _write_sync_payload_preview(base_dir: Path, robot_id: str, config, payload: dict) -> dict:
    """Write local files for checking exactly what will be uploaded.

    - capture_rows_payload.json: exact compact payload body shape before chunking.
    - capture_rows_preview.json: user-facing row list with the requested column names.
    - capture_rows_preview.csv: same user-facing rows, easier to compare in a table.
    """
    run_id = str(payload.get("runId") or "run") if isinstance(payload, dict) else "run"
    platform = getattr(config, "platform", "unknown") or "unknown"
    account_alias = getattr(config, "account_alias", None) or getattr(config, "name", None) or robot_id or "robot"
    preview_dir = output_section_dir(base_dir / "output", platform, account_alias, run_id, "sync_payload")
    preview_dir.mkdir(parents=True, exist_ok=True)

    payload_path = preview_dir / "capture_rows_payload.json"
    payload_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    items = payload.get("items") if isinstance(payload, dict) else []
    if not isinstance(items, list):
        items = []
    display_rows = [_to_display_capture_row(item) for item in items if isinstance(item, dict)]

    preview_path = preview_dir / "capture_rows_preview.json"
    preview_path.write_text(json.dumps(display_rows, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path = preview_dir / "capture_rows_preview.csv"
    columns = [
        "homepageUrl",
        "accountAlias",
        "sourceAccountId",
        "sourceAccountIpLocation",
        "contentTitle",
        "contentUrl",
        "platform",
        "targetType",
        "nickname",
        "userId",
        "visibleRegion",
        "commentUserProfileUrl",
        "commentText",
        "commentId",
        "capturedAt",
        "speechStatus",
        "speechError",
        "speechTranscript",
        "videoDescription",
        "videoTags",
        "workDecisionStatus",
        "workDecisionShouldRun",
        "workDecisionReason",
        "workDecisionWorkflowId",
    ]
    _legacy_columns_text = """
    columns = [
        "当前作品的用户主页地址",
        "用户名",
        "用户id",
        "用户ip地址",
        "当前作品标题",
        "当前作品地址",
        "所属平台",
        "当前评论用户名",
        "当前评论用户id",
        "当前评论用户ip地址",
        "当前评论用户主页地址",
        "当前评论用户的评论内容",
        "评论id",
        "采集时间",
    ]
    """
    with csv_path.open("w", encoding="utf-8-sig", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(display_rows)

    return {"dir": preview_dir, "payload": payload_path, "json": preview_path, "csv": csv_path}


def _to_display_capture_row(item: dict) -> dict:
    return {
        "homepageUrl": item.get("homepageUrl") or item.get("sourceAccountUrl") or "",
        "accountAlias": item.get("accountAlias") or item.get("sourceAccountName") or "",
        "sourceAccountId": item.get("sourceAccountId") or "",
        "sourceAccountIpLocation": item.get("sourceAccountIpLocation") or "",
        "contentTitle": item.get("contentTitle") or "",
        "contentUrl": item.get("contentUrl") or "",
        "platform": item.get("platform") or "",
        "targetType": item.get("targetType") or "",
        "nickname": item.get("nickname") or item.get("commentUserName") or "",
        "userId": item.get("userId") or item.get("commentUserId") or "",
        "visibleRegion": item.get("visibleRegion") or item.get("commentUserIpLocation") or "",
        "commentUserProfileUrl": item.get("commentUserProfileUrl") or "",
        "commentText": item.get("commentText") or item.get("commentContent") or "",
        "commentId": item.get("commentId") or "",
        "capturedAt": item.get("capturedAt") or item.get("commentTimeIso") or "",
        "speechStatus": item.get("speechStatus") or "",
        "speechError": item.get("speechError") or "",
        "speechTranscript": item.get("speechTranscript") or "",
        "videoDescription": item.get("videoDescription") or "",
        "videoTags": "|".join(item.get("videoTags") or []) if isinstance(item.get("videoTags"), list) else (item.get("videoTags") or ""),
        "workDecisionStatus": item.get("workDecisionStatus") or "",
        "workDecisionShouldRun": item.get("workDecisionShouldRun"),
        "workDecisionReason": item.get("workDecisionReason") or "",
        "workDecisionWorkflowId": item.get("workDecisionWorkflowId") or "",
    }
    _legacy_display_row_text = """
    return {
        "当前作品的用户主页地址": item.get("homepageUrl") or item.get("sourceAccountUrl") or "",
        "用户名": item.get("accountAlias") or item.get("sourceAccountName") or "",
        "用户id": item.get("sourceAccountId") or "",
        "用户ip地址": item.get("sourceAccountIpLocation") or "",
        "当前作品标题": item.get("contentTitle") or "",
        "当前作品地址": item.get("contentUrl") or "",
        "所属平台": item.get("platform") or "",
        "当前评论用户名": item.get("nickname") or item.get("commentUserName") or "",
        "当前评论用户id": item.get("userId") or item.get("commentUserId") or "",
        "当前评论用户ip地址": item.get("visibleRegion") or item.get("commentUserIpLocation") or "",
        "当前评论用户主页地址": item.get("commentUserProfileUrl") or "",
        "当前评论用户的评论内容": item.get("commentText") or item.get("commentContent") or "",
        "评论id": item.get("commentId") or "",
        "采集时间": item.get("capturedAt") or item.get("commentTimeIso") or "",
    }
    """



def add_browser_name_arg(parser: argparse.ArgumentParser, default: str = "chromium") -> None:
    parser.add_argument(
        "--browser-name",
        default=default,
        help="浏览器运行时。默认使用项目内置 Playwright Chromium；不再默认回退系统 Chrome/Edge。",
    )


def add_pacing_profile_arg(parser: argparse.ArgumentParser, default: str = DEFAULT_PACING_PROFILE) -> None:
    parser.add_argument(
        "--pacing-profile",
        default=default,
        choices=PACING_PROFILE_CHOICES,
        help="节流档位。conservative 更稳、balanced 均衡、efficient 更紧凑。",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="authorized-content-sync",
        description="抖音内容采集与主动私信客户端；未实现平台已禁用。使用 Playwright Chromium。",
    )
    parser.add_argument("--base-dir", default=".", help="项目根目录，默认当前目录")
    sub = parser.add_subparsers(dest="command", required=True)

    runtime = sub.add_parser("prepare-runtime", help="检查并安装 Playwright 浏览器运行时")
    add_browser_name_arg(runtime)

    login = sub.add_parser("login", help="打开浏览器并保存授权会话")
    login.add_argument("--platform", required=True, choices=SUPPORTED)
    login.add_argument("--account-alias", required=True)
    login.add_argument("--start-url", default=None)
    login.add_argument("--headless", action="store_true")
    login.add_argument("--slow-mo-ms", type=int, default=0)
    add_browser_name_arg(login)

    sync = sub.add_parser("sync", help="旧版 DOM 抽取链路")
    sync.add_argument("--platform", required=True, choices=SUPPORTED)
    sync.add_argument("--account-alias", required=True)
    sync.add_argument("--homepage-url", required=True)
    sync.add_argument("--days", type=int, default=10)
    sync.add_argument("--max-posts", type=int, default=20)
    sync.add_argument("--max-comments-per-post", type=int, default=200)
    sync.add_argument("--max-duration-sec", type=int, default=None)
    sync.add_argument("--headless", action="store_true")
    sync.add_argument("--slow-mo-ms", type=int, default=0)
    add_browser_name_arg(sync)

    probe = sub.add_parser("probe-comments", help="监听评论相关请求与响应")
    probe.add_argument("--platform", required=True, choices=SUPPORTED)
    probe.add_argument("--account-alias", required=True)
    probe.add_argument("--homepage-url", default=None)
    probe.add_argument("--content-url", default=None)
    probe.add_argument("--max-posts", type=int, default=1)
    probe.add_argument("--capture-seconds", type=int, default=10)
    probe.add_argument("--scroll-rounds", type=int, default=4)
    probe.add_argument("--pause-base", type=float, default=1.0)
    probe.add_argument("--headless", action="store_true")
    probe.add_argument("--slow-mo-ms", type=int, default=0)
    add_browser_name_arg(probe)

    posts_api = sub.add_parser("sync-posts-api", help="API-first：从主页抓作品列表，DOM 只负责触发页面行为")
    posts_api.add_argument("--platform", required=True, choices=SUPPORTED)
    posts_api.add_argument("--account-alias", required=True)
    posts_api.add_argument("--homepage-url", required=True)
    posts_api.add_argument("--max-posts", type=int, default=20, help="最大作品数；<=0 表示不限制")
    posts_api.add_argument("--capture-seconds", type=int, default=8)
    posts_api.add_argument("--trigger-scroll-rounds", type=int, default=4)
    posts_api.add_argument("--trigger-pause-sec", type=float, default=1.0)
    posts_api.add_argument("--disable-tab-trigger", action="store_true")
    posts_api.add_argument("--headless", action="store_true")
    posts_api.add_argument("--save-debug-files", action="store_true", help="保存候选接口、分页响应等调试文件")
    posts_api.add_argument("--slow-mo-ms", type=int, default=0)
    add_browser_name_arg(posts_api)
    add_pacing_profile_arg(posts_api)

    comments_api = sub.add_parser("sync-comments-api", help="纯接口化：按作品页抓一级评论")
    comments_api.add_argument("--platform", required=True, choices=SUPPORTED)
    comments_api.add_argument("--account-alias", required=True)
    comments_api.add_argument("--content-url", required=True)
    comments_api.add_argument("--max-comments-per-post", type=int, default=50, help="最大评论数；<=0 表示不限制")
    comments_api.add_argument("--capture-seconds", type=int, default=8)
    comments_api.add_argument("--headless", action="store_true")
    comments_api.add_argument("--save-debug-files", action="store_true", help="保存模板、分页响应等调试文件")
    comments_api.add_argument("--slow-mo-ms", type=int, default=0)
    add_browser_name_arg(comments_api)
    add_pacing_profile_arg(comments_api)


    core_login = sub.add_parser("core-login", help="登录 core-nexus 并缓存 accessToken/refreshToken")
    core_login.add_argument("--core-api-base-url", required=True, help="core-nexus 地址，例如 http://localhost:3000 或 http://localhost:3000/api")
    core_login.add_argument("--username", required=True)
    core_login.add_argument("--password", required=True)
    core_login.add_argument("--tenant-id", default=None)
    core_login.add_argument("--token-cache-path", default="core_session.json")

    core_list = sub.add_parser("core-list-robots", help="从 core-nexus 拉取指定平台截流机器人列表")
    core_list.add_argument("--core-api-base-url", default=None)
    core_list.add_argument("--token-cache-path", default="core_session.json")
    core_list.add_argument("--username", default=None)
    core_list.add_argument("--password", default=None)
    core_list.add_argument("--tenant-id", default=None)
    core_list.add_argument("--platform", default="douyin", choices=SUPPORTED)
    core_list.add_argument("--type", default="INTERCEPT")
    core_list.add_argument("--status", default=None)
    core_list.add_argument("--page-size", type=int, default=50)

    run_config = sub.add_parser("run-robot-config", help="按本地 JSON 配置运行截流机器人，支持多主页/多作品配置")
    run_config.add_argument("--config-file", required=True)
    run_config.add_argument("--ignore-schedule", action="store_true", help="忽略每天运行时间段和运行周期，立即执行一次")
    run_config.add_argument("--ignore-run-cycle", action="store_true", help="只忽略按天运行周期，仍保留每天运行时间段判断")

    run_core = sub.add_parser("run-core-robot", help="登录/读取 core-nexus 机器人详情，并按后端配置执行一次")
    run_core.add_argument("--core-api-base-url", default=None)
    run_core.add_argument("--robot-id", required=True)
    run_core.add_argument("--token-cache-path", default="core_session.json")
    run_core.add_argument("--username", default=None)
    run_core.add_argument("--password", default=None)
    run_core.add_argument("--tenant-id", default=None)
    run_core.add_argument("--ignore-schedule", action="store_true", help="忽略每天运行时间段和运行周期，立即执行一次")
    run_core.add_argument("--ignore-run-cycle", action="store_true", help="只忽略按天运行周期，仍保留每天运行时间段判断；GUI 手动启动默认使用")
    add_browser_name_arg(run_core, default="chromium")
    run_core.add_argument("--headless", action="store_true", help="以无界面模式运行浏览器；需要扫码授权时不要开启")
    run_core.add_argument("--storage-state-path", default=None, help="从 GUI 右侧工作区导出的平台登录态 Cookie 文件")

    continue_sync = sub.add_parser("continue-intercept-sync", help="继续同步本地未完成的截流捕获数据，不重新采集/口播/抓评论")
    continue_sync.add_argument("--core-api-base-url", default=None)
    continue_sync.add_argument("--robot-id", required=True)
    continue_sync.add_argument("--token-cache-path", default="core_session.json")
    continue_sync.add_argument("--username", default=None)
    continue_sync.add_argument("--password", default=None)
    continue_sync.add_argument("--tenant-id", default=None)
    continue_sync.add_argument("--run-id", default=None, help="指定要续传的运行批次；不传则自动选择最近的未完成同步任务")

    recover_intercept = sub.add_parser("recover-intercept-run", help="恢复最近中断的截流采集任务：跳过已完成作品并继续后续同步")
    recover_intercept.add_argument("--core-api-base-url", default=None)
    recover_intercept.add_argument("--robot-id", required=True)
    recover_intercept.add_argument("--token-cache-path", default="core_session.json")
    recover_intercept.add_argument("--username", default=None)
    recover_intercept.add_argument("--password", default=None)
    recover_intercept.add_argument("--tenant-id", default=None)
    recover_intercept.add_argument("--run-id", default=None, help="指定截流运行批次；不传则恢复最近一个可恢复任务")
    add_browser_name_arg(recover_intercept, default="chromium")
    recover_intercept.add_argument("--headless", action="store_true")
    recover_intercept.add_argument("--storage-state-path", default=None, help="平台登录态 Cookie 文件")


    run_pm = sub.add_parser("run-private-message-robot", help="读取 core-nexus 主动私信机器人配置，领取主动私信任务并回传结果")
    run_pm.add_argument("--core-api-base-url", default=None)
    run_pm.add_argument("--robot-id", required=True)
    run_pm.add_argument("--robot-name", default="", help="GUI 传入的机器人名称，用于同名机器人共享 Playwright 登录态")
    run_pm.add_argument("--token-cache-path", default="core_session.json")
    run_pm.add_argument("--username", default=None)
    run_pm.add_argument("--password", default=None)
    run_pm.add_argument("--tenant-id", default=None)
    run_pm.add_argument("--poll-interval-sec", type=int, default=10)
    run_pm.add_argument("--max-empty-rounds", type=int, default=3)
    run_pm.add_argument("--storage-state-path", default=None, help="从 GUI 右侧工作区导出的平台登录态 Cookie 文件")
    add_browser_name_arg(run_pm, default="chromium")
    run_pm.add_argument("--headless", action="store_true", help="以无界面模式运行浏览器；需要人工确认平台页面时不要开启")

    account_api = sub.add_parser("sync-account-api", help="API-first：主页抓全部作品后逐条抓评论，输出统一嵌套 JSON")
    account_api.add_argument("--platform", required=True, choices=SUPPORTED)
    account_api.add_argument("--account-alias", required=True)
    account_api.add_argument("--homepage-url", required=True)
    account_api.add_argument("--max-posts", type=int, default=0, help="最大作品数；<=0 表示不限制")
    account_api.add_argument("--homepage-lookback-days", type=int, default=None, help="主页模式只处理最近 N 天作品；不传则不过滤")
    account_api.add_argument("--max-comments-per-post", type=int, default=0, help="单作品最大评论数；<=0 表示不限制")
    account_api.add_argument("--capture-seconds", type=int, default=8)
    account_api.add_argument("--trigger-scroll-rounds", type=int, default=4)
    account_api.add_argument("--trigger-pause-sec", type=float, default=1.0)
    account_api.add_argument("--disable-tab-trigger", action="store_true")
    account_api.add_argument("--headless", action="store_true")
    account_api.add_argument("--save-debug-files", action="store_true")
    account_api.add_argument("--slow-mo-ms", type=int, default=0)
    add_browser_name_arg(account_api)
    add_pacing_profile_arg(account_api)

    show = sub.add_parser("show-selectors", help="查看当前平台默认 selectors")
    show.add_argument("--platform", required=True, choices=SUPPORTED)

    return parser



def _token_cache_path(base_dir: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else base_dir / path


def _build_core_client_from_args(args, base_dir: Path) -> CoreNexusClient:
    cache_path = _token_cache_path(base_dir, args.token_cache_path)
    base_url = getattr(args, "core_api_base_url", None)
    if args.username and args.password:
        if not base_url and cache_path.exists():
            base_url = load_session(cache_path).base_url
        if not base_url:
            raise ValueError("首次登录 core-nexus 需要传 --core-api-base-url")
        client = CoreNexusClient(base_url)
        session = client.login(args.username, args.password, tenant_id=getattr(args, "tenant_id", None))
        save_session(cache_path, session)
        return client

    session = load_session(cache_path)
    if base_url:
        session.base_url = base_url
    client = CoreNexusClient.from_session(session)
    return client


def _mark_schedule_completed_if_terminal(config, state_dir: Path, summary_path: Path, *, enabled: bool) -> None:
    """Only advance the periodic schedule after a fully terminal intercept run.

    A run with a durable recovery manifest must remain eligible for recovery; marking
    its calendar cycle complete would turn a temporary interruption into a silent
    multi-day collection gap.
    """
    if not enabled:
        return
    try:
        summary = json.loads(Path(summary_path).read_text(encoding="utf-8"))
    except Exception:
        print("[SCHEDULE] 未能读取截流运行摘要；本轮不推进运行周期，避免遗漏恢复任务。")
        return
    recovery = summary.get("recovery") if isinstance(summary.get("recovery"), dict) else {}
    terminal = str(recovery.get("manifestStatus") or "").upper() == "COMPLETED"
    successful = bool(summary.get("ok", False))
    if terminal and successful:
        mark_schedule_completed(config, state_dir)
        return
    print(
        f"[SCHEDULE] 本轮截流未达到完整终态（manifestStatus={recovery.get('manifestStatus') or '-'}，ok={successful}），"
        "不推进运行周期；请使用“恢复任务”继续。",
        flush=True,
    )


def _run_intercept_config(
    base_dir: Path,
    config,
    ignore_schedule: bool = False,
    storage_state_path: Path | None = None,
    ignore_run_cycle: bool = False,
    core_client: CoreNexusClient | None = None,
    resume_manifest: InterceptRunManifest | None = None,
):
    profiles_dir = base_dir / "profiles"
    output_dir = base_dir / "output"
    state_dir = base_dir / "state"
    if not ignore_schedule:
        reason = get_schedule_skip_reason(config, state_dir, ignore_run_cycle=ignore_run_cycle)
        if reason:
            raise RobotRunSkipped(reason)
    profile_key = _safe_runtime_key(config.robot_id, config.account_alias, config.name, fallback="core_robot")
    profile_dir = profiles_dir / config.platform / profile_key
    _write_profile_metadata(
        profile_dir,
        platform=config.platform,
        robot_id=config.robot_id,
        robot_name=config.name,
        robot_type="INTERCEPT",
        account_alias=config.account_alias,
    )
    gui_workspace_only = (
        os.getenv("ACS_FORCE_GUI_WORKSPACE_ONLY", "0").strip().lower() in {"1", "true", "yes", "on"}
        and os.getenv("ACS_GUI_MODE") == "1"
        and os.getenv("ACS_DISABLE_EXTERNAL_BROWSER", "1") != "0"
        and os.getenv("ACS_PLAYWRIGHT_AUTO_INSTALL", "1").strip().lower() in {"0", "false", "no", "off"}
    )
    if gui_workspace_only:
        try:
            ensure_playwright_browser(config.browser_name, logger=print)
        except Exception as exc:
            print(
                "[RUNTIME] Playwright browser is unavailable and automatic install is disabled; "
                "falling back to GUI workspace-only mode.",
                flush=True,
            )
            print(f"[RUNTIME] Playwright unavailable detail: {exc}", flush=True)
            runner = InterceptRobotRunner(context=None, output_dir=output_dir, core_client=core_client)
            result, json_path, summary_path = runner.run_once(config, ignore_schedule=True, resume_manifest=resume_manifest)
            _mark_schedule_completed_if_terminal(
                config,
                state_dir,
                summary_path,
                enabled=not ignore_schedule and not ignore_run_cycle,
            )
            print(f"[OK] GUI workspace-only intercept run completed. JSON: {json_path}")
            print(f"[OK] Summary: {summary_path}")
            print(f"[OK] Output records: {len(result.items)}")
            return result, json_path, summary_path
    with BrowserSession(
        profile_dir=profile_dir,
        headless=config.headless,
        slow_mo_ms=0,
        browser_name=config.browser_name,
        storage_state_path=storage_state_path,
    ) as context:
        print(f"[INFO] 已启动浏览器会话，profile: {profile_dir}，账号标识: {config.account_alias}")
        runner = InterceptRobotRunner(context=context, output_dir=output_dir, core_client=core_client)
        result, json_path, summary_path = runner.run_once(config, ignore_schedule=True, resume_manifest=resume_manifest)
        _mark_schedule_completed_if_terminal(
            config,
            state_dir,
            summary_path,
            enabled=not ignore_schedule and not ignore_run_cycle,
        )
        print(f"[OK] 截流机器人执行完成。JSON: {json_path}")
        print(f"[OK] Summary: {summary_path}")
        print(f"[OK] 输出记录数: {len(result.items)}")
        return result, json_path, summary_path



def _intercept_sync_dry_run_enabled() -> bool:
    """Return whether the legacy local-only sync simulation was explicitly requested.

    Real Core Nexus upload is now the safe production default.  The previous simulator is
    retained for controlled debugging: set ``ACS_INTERCEPT_SYNC_DRY_RUN=1`` before launch
    to write payload/continuation state without making the capture-upload request.
    """
    value = os.getenv("ACS_INTERCEPT_SYNC_DRY_RUN", "0").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _sync_intercept_result(base_dir: Path, client: CoreNexusClient, robot_id: str, config, result, source: str) -> dict:
    """Persist a resumable upload payload and synchronize it when dry-run is disabled."""
    sync_payload = client.build_intercept_capture_payload(result)
    dedupe_stats = getattr(client, "last_capture_dedupe_stats", {}) or {}
    if dedupe_stats.get("dropped"):
        print(
            f"[SYNC] 客户端已去重：原始评论行={dedupe_stats.get('before', 0)}，"
            f"去重后={dedupe_stats.get('after', 0)}，丢弃重复={dedupe_stats.get('dropped', 0)}"
        )
    sync_preview_paths = _write_sync_payload_preview(base_dir, robot_id, config, sync_payload)
    sync_rows = len(sync_payload.get("items") or []) if isinstance(sync_payload, dict) else 0
    sync_payload_bytes = len(json.dumps(sync_payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) if isinstance(sync_payload, dict) else 0
    upload_chunks = client.preview_intercept_upload_chunks(sync_payload) if isinstance(sync_payload, dict) else []
    chunk_sizes = [str(item.get("bytes")) for item in upload_chunks[:10] if isinstance(item, dict)]
    print(
        f"[SYNC] 待同步评论行数：{sync_rows}，总payload大小={sync_payload_bytes} bytes，"
        f"预计分批={len(upload_chunks)}，前几批大小={','.join(chunk_sizes)} bytes"
    )
    print(f"[SYNC] 已输出后端上传payload：{sync_preview_paths.get('payload')}")
    print(f"[SYNC] 已输出可读评论行JSON：{sync_preview_paths.get('json')}")
    print(f"[SYNC] 已输出可读评论行CSV：{sync_preview_paths.get('csv')}")
    payload_file = Path(str(sync_preview_paths.get("payload") or "")) if sync_preview_paths.get("payload") else None
    sync_files = ensure_sync_files(
        base_dir=base_dir,
        robot_id=robot_id,
        platform=config.platform,
        account_alias=config.account_alias,
        payload=sync_payload,
        payload_path=payload_file,
        source=source,
    )
    print(f"[SYNC] 已保存续传状态：{sync_files.get('statePath')}")
    sync_dry_run = _intercept_sync_dry_run_enabled()
    if sync_dry_run:
        upload_result = {"created": 0, "received": sync_rows, "chunks": len(upload_chunks) or 0, "dryRun": True}
        print("[SYNC] 当前为试运行模式：仅生成同步payload和预估分批，不调用 core-nexus 截流捕获同步接口。")
        print(f"[OK] 已模拟同步截流捕获数据到 core-nexus：预计接收={sync_rows}，预计分批={len(upload_chunks)}，实际新增=0（未调用接口）")
    else:
        upload_result = upload_payload_with_state(
            client=client,
            robot_id=robot_id,
            payload=sync_payload,
            state_path=Path(sync_files["statePath"]),
        )
        failed_total = int(upload_result.get('backendFailedRows') or 0) + int(upload_result.get('clientFailedRows') or 0)
        failed_tail = f"，异常行={failed_total}，详情={upload_result.get('failedRowsPath')}" if failed_total else ""
        print(f"[OK] 已同步截流捕获数据到 core-nexus：新增={upload_result.get('created', 0)}，接收={upload_result.get('received', 0)}，分批={upload_result.get('chunks', 1)}{failed_tail}")
    return {"payload": sync_payload, "syncFiles": sync_files, "upload": upload_result}


def _print_runtime_plan(config, state_dir: Path, ignore_run_cycle: bool = False) -> None:
    mode_label = "主页" if config.target_mode == "homepage" else "作品"
    target_count = len(config.enabled_homepage_targets) if config.target_mode == "homepage" else len(config.enabled_content_targets)
    windows = ", ".join([f"{w.start}-{w.end}" for w in config.run_windows if w.enabled]) or "未配置"
    print(
        f"[PLAN] 模式={mode_label}，目标数={target_count}，运行时间={windows}，"
        f"运行间隔={config.run_every_days}天，单目标最长={config.max_target_minutes}分钟"
    )
    reason = get_schedule_skip_reason(config, state_dir, ignore_run_cycle=ignore_run_cycle)
    if reason:
        print(f"[PLAN] 当前不会执行：{reason}")
    else:
        print("[PLAN] 当前满足运行条件，准备执行采集。")

def main(argv: list[str] | None = None) -> int:
    argv = argv or sys.argv[1:]
    parser = build_parser()
    args = parser.parse_args(argv)

    base_dir = Path(args.base_dir).resolve()
    profiles_dir = base_dir / "profiles"
    output_dir = base_dir / "output"

    if args.command == "core-login":
        try:
            client = CoreNexusClient(args.core_api_base_url)
            session = client.login(args.username, args.password, tenant_id=args.tenant_id)
            cache_path = save_session(_token_cache_path(base_dir, args.token_cache_path), session)
            print(f"[OK] core-nexus 登录成功，缓存文件: {cache_path}")
            if session.tenant_id:
                print(f"[OK] tenant_id: {session.tenant_id}")
            return 0
        except Exception as exc:
            print(f"[ERR] core-nexus 登录失败: {exc}")
            return 1

    if args.command == "core-list-robots":
        try:
            client = _build_core_client_from_args(args, base_dir)
            data = client.list_robots(platform=args.platform, robot_type=args.type, status=args.status, page_size=args.page_size)
            print(json.dumps(data, ensure_ascii=False, indent=2))
            return 0
        except Exception as exc:
            print(f"[ERR] 获取 core-nexus 机器人列表失败: {exc}")
            return 1


    if args.command == "run-private-message-robot":
        try:
            client = _build_core_client_from_args(args, base_dir)
            worker = PrivateMessageWorker(
                client=client,
                options=PrivateMessageRuntimeOptions(
                    robot_id=args.robot_id,
                    base_dir=base_dir,
                    robot_name=str(getattr(args, "robot_name", "") or ""),
                    browser_name=args.browser_name or "chromium",
                    headless=bool(args.headless),
                    storage_state_path=Path(args.storage_state_path) if getattr(args, "storage_state_path", None) else None,
                    poll_interval_sec=max(1, int(args.poll_interval_sec or 10)),
                    max_empty_rounds=max(1, int(args.max_empty_rounds or 3)),
                ),
            )
            return worker.run()
        except Exception as exc:
            print(f"[ERR] 主动私信机器人执行失败: {exc}")
            return 1

    if args.command == "run-robot-config":
        try:
            config = load_intercept_config_file(Path(args.config_file))
            _run_intercept_config(base_dir, config, ignore_schedule=args.ignore_schedule, ignore_run_cycle=getattr(args, "ignore_run_cycle", False))
            return 0
        except RobotRunSkipped as exc:
            print(f"[SKIP] {exc}")
            return 0
        except Exception as exc:
            print(f"[ERR] 本地机器人配置执行失败: {exc}")
            return 1

    if args.command == "continue-intercept-sync":
        client = None
        try:
            client = _build_core_client_from_args(args, base_dir)
            robot = client.get_robot(args.robot_id)
            config = normalize_robot_detail(robot)
            task = find_resume_task(
                base_dir=base_dir,
                robot_id=args.robot_id,
                platform=config.platform,
                account_alias=config.account_alias,
                run_id=getattr(args, "run_id", None),
            )
            if not task:
                print("[SYNC] 没有找到可继续同步的本地截流数据。")
                return 0
            print(
                f"[SYNC] 找到续传任务：runId={task.get('runId')}，"
                f"status={task.get('status')}，目录={task.get('runDir')}"
            )
            payload = load_payload_for_task(client, task)
            rows = len(payload.get("items") or []) if isinstance(payload, dict) else 0
            if rows <= 0:
                print("[SYNC] 本地续传任务没有可同步评论行，已跳过。")
                return 0
            state_path = Path(str(task.get("statePath") or ""))
            payload_path = Path(str(task.get("payloadPath") or "")) if task.get("payloadPath") else None
            sync_files = ensure_sync_files(
                base_dir=base_dir,
                robot_id=args.robot_id,
                platform=config.platform,
                account_alias=config.account_alias,
                payload=payload,
                payload_path=payload_path if payload_path and payload_path.exists() else None,
                source="continue-intercept-sync",
            )
            state_path = Path(sync_files["statePath"])
            chunks = client.preview_intercept_upload_chunks(payload)
            chunk_sizes = [str(item.get("bytes")) for item in chunks[:10] if isinstance(item, dict)]
            print(
                f"[SYNC] 准备继续同步：评论行={rows}，预计分批={len(chunks)}，"
                f"前几批大小={','.join(chunk_sizes)} bytes"
            )
            client.update_runtime_status(args.robot_id, "RUNNING")
            upload_result = upload_payload_with_state(
                client=client,
                robot_id=args.robot_id,
                payload=payload,
                state_path=state_path,
            )
            failed_total = int(upload_result.get('backendFailedRows') or 0) + int(upload_result.get('clientFailedRows') or 0)
            failed_tail = f"，异常行={failed_total}，详情={upload_result.get('failedRowsPath')}" if failed_total else ""
            print(f"[OK] 继续同步完成：新增={upload_result.get('created', 0)}，接收={upload_result.get('received', 0)}，分批={upload_result.get('chunks', 1)}{failed_tail}")
            client.update_runtime_status(args.robot_id, "STOPPED", stop_reason="MANUAL")
            return 0
        except Exception as exc:
            print(f"[ERR] 继续同步截流捕获数据失败: {exc}")
            if client:
                try:
                    client.update_runtime_status(args.robot_id, "ERROR", stop_reason="SYSTEM_ERROR", last_error=str(exc))
                except Exception:
                    pass
            return 1

    if args.command == "recover-intercept-run":
        client = None
        try:
            client = _build_core_client_from_args(args, base_dir)
            robot = client.get_robot(args.robot_id)
            config = normalize_robot_detail(robot)
            if getattr(args, "browser_name", None):
                config.browser_name = args.browser_name
            if getattr(args, "headless", False):
                config.headless = True
            manifest = InterceptRunManifest.find_latest(base_dir, config, run_id=getattr(args, "run_id", None))
            if manifest is None:
                print("[RECOVERY] 没有找到可恢复的截流运行；可使用“继续同步”补传已采集结果。")
                return 0
            if manifest.has_live_process():
                print(
                    f"[RECOVERY] 任务 runId={manifest.run_id} 仍由本机进程运行（pid={manifest.payload.get('pid')}），"
                    "不会启动第二个截流实例。请先等待它结束，或在 GUI 中请求安全停止。"
                )
                return 0
            print(
                f"[RECOVERY] 找到可恢复任务：runId={manifest.run_id}，status={manifest.payload.get('status')}，"
                f"未完成目标={manifest.unfinished_targets()}，最后阶段={manifest.payload.get('lastStage')}"
            )
            client.update_runtime_status(args.robot_id, "RUNNING")
            storage_state_path = Path(args.storage_state_path) if getattr(args, "storage_state_path", None) else None
            result, _, _ = _run_intercept_config(
                base_dir,
                config,
                ignore_schedule=True,
                storage_state_path=storage_state_path,
                ignore_run_cycle=True,
                core_client=client,
                resume_manifest=manifest,
            )
            _sync_intercept_result(base_dir, client, args.robot_id, config, result, source="recover-intercept-run")
            completed_manifest = InterceptRunManifest.open(base_dir, config, manifest.path)
            status = str(completed_manifest.payload.get("status") or "")
            print(f"[RECOVERY] 恢复运行结束：manifestStatus={status}，未完成目标={completed_manifest.unfinished_targets()}")
            client.update_runtime_status(args.robot_id, "STOPPED", stop_reason="MANUAL")
            return 0
        except InterceptStopRequested as exc:
            print(f"[STOPPED] {exc}")
            if client:
                try:
                    client.update_runtime_status(args.robot_id, "STOPPED", stop_reason="MANUAL")
                except Exception:
                    pass
            return 0
        except Exception as exc:
            print(f"[ERR] 恢复截流任务失败: {exc}")
            if client:
                try:
                    client.update_runtime_status(args.robot_id, "ERROR", stop_reason="SYSTEM_ERROR", last_error=str(exc))
                except Exception:
                    pass
            return 1

    if args.command == "run-core-robot":
        client = None
        try:
            client = _build_core_client_from_args(args, base_dir)
            robot = client.get_robot(args.robot_id)
            config = normalize_robot_detail(robot)
            if getattr(args, "browser_name", None):
                config.browser_name = args.browser_name
            if getattr(args, "headless", False):
                config.headless = True
            if os.getenv("ACS_GUI_MODE") == "1" and os.getenv("ACS_DISABLE_EXTERNAL_BROWSER", "1") != "0":
                config.headless = True
                print("[INFO] GUI 模式：不额外打开采集浏览器窗口；右侧工作区作为唯一可见平台浏览器，采集进程后台执行。")
            elif os.getenv("ACS_GUI_MODE") == "1" and not config.headless:
                print("[INFO] GUI 模式：已启用外部可见采集窗口；滚动/刷新会显示在该采集窗口中。")
            state_dir = base_dir / "state"
            _print_runtime_plan(config, state_dir, ignore_run_cycle=getattr(args, "ignore_run_cycle", False))
            if not args.ignore_schedule:
                reason = get_schedule_skip_reason(config, state_dir, ignore_run_cycle=getattr(args, "ignore_run_cycle", False))
                if reason:
                    print(f"[SKIP] {reason}")
                    return 0
            client.update_runtime_status(args.robot_id, "RUNNING")
            storage_state_path = Path(args.storage_state_path) if getattr(args, "storage_state_path", None) else None
            result, _, _ = _run_intercept_config(
                base_dir,
                config,
                ignore_schedule=args.ignore_schedule,
                storage_state_path=storage_state_path,
                ignore_run_cycle=getattr(args, "ignore_run_cycle", False),
                core_client=client,
            )
            sync_payload = client.build_intercept_capture_payload(result)
            dedupe_stats = getattr(client, "last_capture_dedupe_stats", {}) or {}
            if dedupe_stats.get("dropped"):
                print(
                    f"[SYNC] 客户端已去重：原始评论行={dedupe_stats.get('before', 0)}，"
                    f"去重后={dedupe_stats.get('after', 0)}，丢弃重复={dedupe_stats.get('dropped', 0)}"
                )
            sync_preview_paths = _write_sync_payload_preview(base_dir, args.robot_id, config, sync_payload)
            sync_rows = len(sync_payload.get("items") or []) if isinstance(sync_payload, dict) else 0
            sync_payload_bytes = len(json.dumps(sync_payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) if isinstance(sync_payload, dict) else 0
            upload_chunks = client.preview_intercept_upload_chunks(sync_payload) if isinstance(sync_payload, dict) else []
            chunk_sizes = [str(item.get("bytes")) for item in upload_chunks[:10] if isinstance(item, dict)]
            print(
                f"[SYNC] 待同步评论行数：{sync_rows}，"
                f"总payload大小={sync_payload_bytes} bytes，"
                f"预计分批={len(upload_chunks)}，"
                f"前几批大小={','.join(chunk_sizes)} bytes"
            )
            print(f"[SYNC] 已输出后端上传payload：{sync_preview_paths.get('payload')}")
            print(f"[SYNC] 已输出可读评论行JSON：{sync_preview_paths.get('json')}")
            print(f"[SYNC] 已输出可读评论行CSV：{sync_preview_paths.get('csv')}")
            payload_file = Path(str(sync_preview_paths.get('payload') or "")) if sync_preview_paths.get('payload') else None
            sync_files = ensure_sync_files(
                base_dir=base_dir,
                robot_id=args.robot_id,
                platform=config.platform,
                account_alias=config.account_alias,
                payload=sync_payload,
                payload_path=payload_file,
                source="run-core-robot",
            )
            print(f"[SYNC] 已保存续传状态：{sync_files.get('statePath')}")
            sync_dry_run = _intercept_sync_dry_run_enabled()
            if sync_dry_run:
                upload_result = {
                    "created": 0,
                    "received": sync_rows,
                    "chunks": len(upload_chunks) or 0,
                    "dryRun": True,
                }
                print("[SYNC] 当前为试运行模式：仅生成同步payload和预估分批，不调用 core-nexus 截流捕获同步接口。")
                print(f"[OK] 已模拟同步截流捕获数据到 core-nexus：预计接收={sync_rows}，预计分批={len(upload_chunks)}，实际新增=0（未调用接口）")
            else:
                upload_result = upload_payload_with_state(
                    client=client,
                    robot_id=args.robot_id,
                    payload=sync_payload,
                    state_path=Path(sync_files["statePath"]),
                )
                failed_total = int(upload_result.get('backendFailedRows') or 0) + int(upload_result.get('clientFailedRows') or 0)
                failed_tail = f"，异常行={failed_total}，详情={upload_result.get('failedRowsPath')}" if failed_total else ""
                print(f"[OK] 已同步截流捕获数据到 core-nexus：新增={upload_result.get('created', 0)}，接收={upload_result.get('received', 0)}，分批={upload_result.get('chunks', 1)}{failed_tail}")
            client.update_runtime_status(args.robot_id, "STOPPED", stop_reason="MANUAL")
            return 0
        except InterceptStopRequested as exc:
            print(f"[STOPPED] {exc}")
            if client:
                try:
                    client.update_runtime_status(args.robot_id, "STOPPED", stop_reason="MANUAL")
                except Exception:
                    pass
            return 0
        except RobotRunSkipped as exc:
            print(f"[SKIP] {exc}")
            if client:
                try:
                    client.update_runtime_status(args.robot_id, "STOPPED", stop_reason="MANUAL")
                except Exception:
                    pass
            return 0
        except Exception as exc:
            print(f"[ERR] core-nexus 机器人执行失败: {exc}")
            if client:
                try:
                    client.update_runtime_status(args.robot_id, "ERROR", stop_reason="SYSTEM_ERROR", last_error=str(exc))
                except Exception:
                    pass
            return 1

    if args.command == "prepare-runtime":
        print("[INFO] 开始检查 Playwright 运行时")
        try:
            selected_browser = ensure_playwright_browser_with_fallback(args.browser_name, logger=print)
        except Exception as exc:
            print(f"[ERR] Playwright 运行时检查失败: {exc}")
            return 1
        print(f"[OK] Playwright 运行时已就绪，使用浏览器：{selected_browser}")
        return 0

    if args.command == "show-selectors":
        selectors = load_selectors(base_dir, args.platform)
        print(json.dumps(selectors, ensure_ascii=False, indent=2))
        return 0

    selectors = load_selectors(base_dir, args.platform)
    profile_key = _safe_runtime_key(args.account_alias, fallback="local_account")
    profile_dir = profiles_dir / args.platform / profile_key

    with BrowserSession(
        profile_dir=profile_dir,
        headless=args.headless,
        slow_mo_ms=args.slow_mo_ms,
        browser_name=args.browser_name,
    ) as context:
        print(f"[INFO] 已启动浏览器会话，profile: {profile_dir}，账号标识: {args.account_alias}")
        scraper = PlatformScraper(platform=args.platform, selectors=selectors, context=context)

        if args.command == "login":
            start_url = args.start_url or selectors.get("start_url")
            print(f"[INFO] 准备打开登录页: {start_url}")
            scraper.login(start_url=start_url)
            print(f"[OK] 会话已保存在: {profile_dir}")
            return 0

        if args.command == "sync":
            result = scraper.sync(
                homepage_url=args.homepage_url,
                account_alias=args.account_alias,
                days=args.days,
                max_posts=args.max_posts,
                max_comments_per_post=args.max_comments_per_post,
                max_duration_sec=args.max_duration_sec,
            )
            store = ResultStore(output_dir)
            json_path, csv_path, xlsx_path = store.save(result)
            print(f"[OK] 抓取完成。JSON: {json_path}")
            print(f"[OK] 评论 CSV: {csv_path}")
            print(f"[OK] Excel: {xlsx_path}")
            print(f"[OK] 抓取作品数: {len(result.items)}")
            return 0

        if args.command == "probe-comments":
            probe = CommentAPINetworkProbe(
                platform=args.platform,
                selectors=selectors,
                context=context,
                output_dir=output_dir,
            )
            summary_path, summary = probe.probe(
                homepage_url=args.homepage_url,
                account_alias=args.account_alias,
                content_url=args.content_url,
                max_posts=args.max_posts,
                capture_seconds=args.capture_seconds,
                scroll_rounds=args.scroll_rounds,
                pause_base=args.pause_base,
            )
            print(f"[OK] 评论接口监听完成。Summary: {summary_path}")
            print(f"[OK] 监听作品数: {len(summary.get('items', []))}")
            for item in summary.get("items", []):
                print(
                    f"[OK] video_id={item.get('video_id')} captured_candidate_count={item.get('captured_candidate_count')}"
                )
            return 0

        try:
            adapter = get_platform_adapter(args.platform)
        except Exception as exc:
            print(f"[ERR] 当前平台暂未提供 API-first adapter: {exc}")
            return 1

        if args.command == "sync-posts-api":
            collector = adapter.create_posts_collector(
                context=context,
                output_dir=output_dir,
                pacing_policy=build_crawl_pacing_policy(args.pacing_profile),
            )
            result, summary_path = collector.sync(
                account_alias=args.account_alias,
                homepage_url=args.homepage_url,
                homepage_label=args.account_alias,
                max_posts=args.max_posts,
                capture_seconds=args.capture_seconds,
                trigger_scroll_rounds=args.trigger_scroll_rounds,
                trigger_pause_sec=args.trigger_pause_sec,
                trigger_tab_click=not args.disable_tab_trigger,
                save_debug_files=args.save_debug_files,
            )
            store = ResultStore(output_dir)
            json_path = store.save_nested_json(result)
            print(f"[OK] posts api 抓取完成。JSON: {json_path}")
            print(f"[OK] debug summary: {summary_path}")
            print(f"[OK] 抓取作品数: {len(result.items)}")
            return 0

        if args.command == "sync-comments-api":
            collector = adapter.create_comments_collector(
                context=context,
                output_dir=output_dir,
                pacing_policy=build_crawl_pacing_policy(args.pacing_profile),
            )
            result, summary_path = collector.sync(
                account_alias=args.account_alias,
                content_url=args.content_url,
                max_comments_per_post=args.max_comments_per_post,
                capture_seconds=args.capture_seconds,
                save_debug_files=args.save_debug_files,
            )
            store = ResultStore(output_dir)
            json_path = store.save_nested_json(result)
            total_comments = sum(len(item.comments or []) for item in result.items)
            print(f"[OK] comments api 抓取完成。JSON: {json_path}")
            print(f"[OK] debug summary: {summary_path}")
            print(f"[OK] 抓取视频数: {len(result.items)}")
            print(f"[OK] 抓取评论数: {total_comments}")
            return 0

        if args.command == "sync-account-api":
            service = AccountSyncService(
                platform=args.platform,
                context=context,
                output_dir=output_dir,
                pacing_policy=build_crawl_pacing_policy(args.pacing_profile),
            )
            result, summary_path = service.sync_account_api(
                account_alias=args.account_alias,
                homepage_url=args.homepage_url,
                homepage_label=args.account_alias,
                max_posts=args.max_posts,
                max_comments_per_post=args.max_comments_per_post,
                capture_seconds=args.capture_seconds,
                trigger_scroll_rounds=args.trigger_scroll_rounds,
                trigger_pause_sec=args.trigger_pause_sec,
                trigger_tab_click=not args.disable_tab_trigger,
                save_debug_files=args.save_debug_files,
                homepage_lookback_days=args.homepage_lookback_days,
            )
            store = ResultStore(output_dir)
            json_path = store.save_nested_json(result)
            total_comments = sum(len(item.comments or []) for item in result.items)
            print(f"[OK] account api 抓取完成。JSON: {json_path}")
            print(f"[OK] debug summary: {summary_path}")
            print(f"[OK] 抓取作品数: {len(result.items)}")
            print(f"[OK] 抓取评论数: {total_comments}")
            return 0

    return 0
