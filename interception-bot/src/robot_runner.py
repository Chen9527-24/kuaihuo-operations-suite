from __future__ import annotations

import hashlib
import json
import random
import re
import time
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Tuple

from playwright.sync_api import BrowserContext

from .account_sync_service import AccountSyncService
from .comments_api import infer_content_id
from .models import ContentRecord, RunResult, count_comment_tree
from .pacing import build_crawl_pacing_policy, sleep_seconds, with_comment_page_pause_range
from .platform_registry import get_platform_adapter
from .robot_config import InterceptRobotConfig, is_now_in_run_windows
from .speech_analysis import SpeechAnalysisResult
from .storage import ResultStore, cleanup_output_retention, cleanup_speech_debug_dir, output_section_dir
from .intercept_recovery import InterceptRunManifest, InterceptStopController, InterceptStopRequested, content_key


def _safe_path_key(value: object, fallback: str = "robot") -> str:
    raw = str(value or "").strip() or fallback
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", raw).strip("_")[:56] or fallback
    digest = hashlib.sha1(raw.encode("utf-8", errors="ignore")).hexdigest()[:10]
    return f"{safe}_{digest}" if digest and digest not in safe else safe


class RobotRunSkipped(RuntimeError):
    pass


def _emit_target_event(event: str, payload: Dict[str, Any]) -> None:
    data = {"event": event, **payload}
    print("[TARGET] " + json.dumps(data, ensure_ascii=False), flush=True)


def _random_seconds(min_sec: float, max_sec: float) -> float:
    lower = max(float(min_sec or 0), 0.0)
    upper = max(float(max_sec or 0), lower)
    if upper <= 0:
        return 0.0
    return round(random.uniform(lower, upper), 2)


def _ordered_targets(targets: List[Any], randomize: bool) -> List[Any]:
    ordered = list(targets)
    if randomize and len(ordered) > 1:
        random.shuffle(ordered)
    return ordered


class InterceptRobotRunner:
    def __init__(self, context: BrowserContext | None, output_dir: Path, core_client: Any | None = None):
        self.context = context
        self.output_dir = output_dir
        self.core_client = core_client

    def run_once(
        self,
        config: InterceptRobotConfig,
        ignore_schedule: bool = False,
        resume_manifest: InterceptRunManifest | None = None,
    ) -> Tuple[RunResult, Path, Path]:
        config.validate_for_run()
        if not ignore_schedule and not is_now_in_run_windows(config.run_windows, timezone=config.timezone):
            raise RobotRunSkipped("当前时间不在机器人运行时间段内")

        base_dir = self.output_dir.parent
        stop_controller = InterceptStopController(base_dir, config.robot_id, config.account_alias)
        stop_controller.clear()
        run_id = resume_manifest.run_id if resume_manifest is not None else datetime.now().strftime("%Y%m%d_%H%M%S")
        summary_dir = output_section_dir(self.output_dir, config.platform, config.account_alias, run_id, "robot_run")
        summary_dir.mkdir(parents=True, exist_ok=True)
        result = RunResult(
            run_id=run_id,
            platform=config.platform,
            homepage_url="multi_target",
            account_alias=config.account_alias,
            generated_at=datetime.now().astimezone().isoformat(),
            items=[],
        )
        summary: Dict[str, Any] = {
            "run_id": run_id,
            "robot_id": config.robot_id,
            "name": config.name,
            "platform": config.platform,
            "account_alias": config.account_alias,
            "target_mode": config.target_mode,
            "homepage_lookback_days": config.homepage_lookback_days,
            "randomize_targets": config.randomize_targets,
            "comment_fetch_max_seconds": config.comment_fetch_max_seconds,
            "post_cooldown_sec": {"min": config.post_cooldown_min_sec, "max": config.post_cooldown_max_sec},
            "account_cooldown_sec": {"min": config.account_cooldown_min_sec, "max": config.account_cooldown_max_sec},
            "comment_page_pause_sec": {"min": config.comment_page_pause_min_sec, "max": config.comment_page_pause_max_sec},
            "run_windows": [asdict(w) for w in config.run_windows],
            "work_decision": {
                "enabled": config.work_decision_enabled,
                "workflow_id": config.work_decision_workflow_id or "",
                "fail_strategy": config.work_decision_fail_strategy,
            },
            "targets": [],
            "ok": True,
            "errors": [],
            "recovery": {"resumed": resume_manifest is not None, "manifest": ""},
        }
        result_store = ResultStore(self.output_dir)

        def save_checkpoint(reason: str = "") -> Path:
            # Incrementally persist already processed data so a later sync/network
            # failure or process interruption does not make the completed part disappear.
            result.generated_at = datetime.now().astimezone().isoformat()
            json_path = result_store.save_nested_json(result)
            summary["items_collected"] = len(result.items)
            summary["json_path"] = str(json_path)
            summary["checkpoint_reason"] = reason or "checkpoint"
            summary["checkpoint_at"] = result.generated_at
            try:
                summary_path_tmp = summary_dir / "summary.json"
                summary_path_tmp.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
            except Exception:
                pass
            return json_path

        save_checkpoint("run_started")
        if config.work_decision_enabled:
            workflow_display = config.work_decision_workflow_id or "<未配置，禁止调用云判定>"
            print(
                f"[PLAN] 作品前置判定已启用：workflowId={workflow_display} failStrategy={config.work_decision_fail_strategy}",
                flush=True,
            )
            if not config.work_decision_workflow_id:
                print("[WARN] 请明确填写 workDecision.workflowId 或关闭作品判定；不会调用后端默认工作流。", flush=True)

        pacing = with_comment_page_pause_range(
            build_crawl_pacing_policy(config.pacing_profile),
            config.comment_page_pause_min_sec,
            config.comment_page_pause_max_sec,
        )
        adapter = get_platform_adapter(config.platform)
        homepage_targets = _ordered_targets(config.enabled_homepage_targets, config.randomize_targets)
        content_targets = _ordered_targets(config.enabled_content_targets, config.randomize_targets)
        initial_targets: List[Dict[str, Any]] = (
            [{"type": "homepage", "url": target.url, "label": target.label} for target in homepage_targets]
            if config.target_mode == "homepage"
            else [{"type": "content", "url": target.url, "label": target.label} for target in content_targets]
        )
        manifest = resume_manifest or InterceptRunManifest.create(base_dir, config, run_id, initial_targets)
        if resume_manifest is not None:
            persisted = list(manifest.payload.get("targets") or [])
            if config.target_mode == "homepage":
                homepage_targets = [SimpleNamespace(url=str(item.get("url") or ""), label=str(item.get("label") or "")) for item in persisted if str(item.get("type") or "") == "homepage"]
            else:
                content_targets = [SimpleNamespace(url=str(item.get("url") or ""), label=str(item.get("label") or "")) for item in persisted if str(item.get("type") or "") == "content"]
            manifest.set_status("RUNNING", "manual_resume_started")
            result.items.extend(manifest.completed_items())
            print(f"[RECOVERY] 恢复截流运行：runId={manifest.run_id} 已完成作品={len(result.items)} 未完成目标={manifest.unfinished_targets()}", flush=True)
        summary["recovery"].update({"manifest": str(manifest.path), "runId": manifest.run_id})

        def append_unique_items(items: List[ContentRecord]) -> None:
            existing = {content_key(item) for item in result.items}
            for item in items:
                key = content_key(item)
                if key not in existing:
                    result.items.append(item)
                    existing.add(key)

        def manifest_progress(target_key: str, event: str, payload: Dict[str, Any]) -> None:
            item = payload.get("item")
            if event in {"posts_discovered", "posts_resumed"}:
                manifest.register_posts(target_key, list(payload.get("items") or []))
            elif event == "post_started" and isinstance(item, ContentRecord):
                manifest.mark_post_started(target_key, item)
            elif event == "post_completed" and isinstance(item, ContentRecord):
                manifest.mark_post_completed(target_key, item, status=str(payload.get("status") or "COMPLETED"))
            elif event == "post_failed" and isinstance(item, ContentRecord):
                manifest.mark_post_failed(target_key, item, str(payload.get("error") or "unknown post error"))
            else:
                manifest.heartbeat(str(payload.get("stage") or event), str(payload.get("homepage_url") or ""))

        def sleep_interruptibly(seconds: float, stage: str) -> None:
            remaining = max(float(seconds or 0), 0.0)
            while remaining > 0:
                stop_controller.ensure_not_requested(stage)
                chunk = min(0.5, remaining)
                time.sleep(chunk)
                remaining -= chunk
            stop_controller.ensure_not_requested(stage)

        save_checkpoint("recovery_manifest_ready")
        homepage_total = len(homepage_targets)
        content_total = len(content_targets)
        print(
            f"[RUN] 开始执行截流任务：mode={config.target_mode} homepageTargets={homepage_total} contentTargets={content_total}",
            flush=True,
        )

        if config.target_mode == "homepage":
            account_service = AccountSyncService(
                config.platform,
                self.context,
                self.output_dir,
                pacing_policy=pacing,
                core_client=self.core_client,
                robot_id=config.robot_id,
            )
            print(f"[PLAN] 监听账号访问顺序：{'随机' if config.randomize_targets else '按列表'}，本轮不重复，数量={homepage_total}", flush=True)
            for index, target in enumerate(homepage_targets, start=1):
                target_key = manifest.target_key_for("homepage", target.url, index)
                if manifest.is_target_complete(target_key):
                    print(f"[RECOVERY] 跳过已完成主页目标：{index}/{homepage_total} {target.url}", flush=True)
                    continue
                stop_controller.ensure_not_requested("homepage_target_start")
                manifest.mark_target_started(target_key)
                item_summary: Dict[str, Any] = {"type": "homepage", "index": index, "url": target.url, "label": target.label}
                _emit_target_event("start", {"type": "homepage", "index": index, "total": homepage_total, "url": target.url, "label": target.label})
                try:
                    pending_items = manifest.pending_posts(target_key) if manifest.has_post_plan(target_key) else None
                    homepage_result, homepage_summary_path = account_service.sync_account_api(
                        account_alias=config.account_alias,
                        homepage_url=target.url,
                        homepage_label=target.label,
                        max_posts=config.max_posts,
                        max_comments_per_post=config.max_comments_per_post,
                        capture_seconds=config.capture_seconds,
                        trigger_scroll_rounds=config.trigger_scroll_rounds,
                        trigger_pause_sec=config.trigger_pause_sec,
                        trigger_tab_click=True,
                        save_debug_files=config.save_debug_files,
                        homepage_lookback_days=config.homepage_lookback_days,
                        max_target_seconds=config.max_target_minutes * 60,
                        comment_fetch_max_seconds=config.comment_fetch_max_seconds,
                        max_post_duration_seconds=config.max_post_duration_seconds,
                        speech_enabled=config.speech_enabled,
                        speech_fail_strategy=config.speech_fail_strategy,
                        speech_empty_transcript_strategy=config.speech_empty_transcript_strategy,
                        work_decision_enabled=config.work_decision_enabled,
                        work_decision_workflow_id=config.work_decision_workflow_id,
                        work_decision_fail_strategy=config.work_decision_fail_strategy,
                        post_cooldown_min_sec=config.post_cooldown_min_sec,
                        post_cooldown_max_sec=config.post_cooldown_max_sec,
                        run_id=run_id,
                        target_index=index,
                        resume_items=pending_items,
                        progress_callback=lambda event, payload, key=target_key: manifest_progress(key, event, payload),
                        stop_check=stop_controller.is_requested,
                    )
                    append_unique_items(homepage_result.items)
                    pending_after = manifest.pending_posts(target_key) if manifest.has_post_plan(target_key) else []
                    if pending_after:
                        pending_count = len(pending_after)
                        manifest.mark_target_completed(
                            target_key,
                            status="RECOVERABLE",
                            error=f"target ended with {pending_count} pending post(s); resume required",
                        )
                        print(f"[RECOVERY] 当前主页达到时间预算或提前结束，保留未完成作品断点：待恢复={pending_count}", flush=True)
                    else:
                        pending_count = 0
                        manifest.mark_target_completed(target_key, status="COMPLETED")
                    item_summary.update(
                        {
                            "ok": True,
                            "posts_collected": len(homepage_result.items),
                            "pending_posts": pending_count,
                            "summary_path": str(homepage_summary_path),
                        }
                    )
                    _emit_target_event("done", {"type": "homepage", "index": index, "total": homepage_total, "url": target.url, "label": target.label, "items": len(homepage_result.items)})
                except InterceptStopRequested as exc:
                    manifest.set_status("STOPPED", str(exc))
                    save_checkpoint(f"homepage_{index}_stopped")
                    raise
                except Exception as exc:
                    summary["ok"] = False
                    manifest.mark_target_completed(target_key, status="ERROR", error=str(exc))
                    item_summary.update({"ok": False, "error": str(exc)})
                    summary["errors"].append(item_summary)
                    _emit_target_event("error", {"type": "homepage", "index": index, "total": homepage_total, "url": target.url, "label": target.label, "error": str(exc)})
                summary["targets"].append(item_summary)
                save_checkpoint(f"homepage_{index}_done")
                if index < homepage_total:
                    cooldown_sec = _random_seconds(config.account_cooldown_min_sec, config.account_cooldown_max_sec)
                    item_summary["cooldown_after_account_sec"] = cooldown_sec
                    if cooldown_sec > 0:
                        stop_controller.ensure_not_requested("homepage_cooldown")
                        print(f"[STEP] 监听账号处理完成，休息 {cooldown_sec:.2f}s 后进入下一个账号。", flush=True)
                        sleep_interruptibly(cooldown_sec, "homepage_cooldown")

        if config.target_mode == "content" and self.context is None:
            print(
                "[RUN] Playwright browser is unavailable; content comment capture requires Playwright and will be skipped.",
                flush=True,
            )
            for index, target in enumerate(content_targets, start=1):
                target_key = manifest.target_key_for("content", target.url, index)
                if manifest.is_target_complete(target_key):
                    continue
                stop_controller.ensure_not_requested("content_workspace_unavailable")
                manifest.mark_target_started(target_key)
                item_summary = {
                    "type": "content",
                    "index": index,
                    "url": target.url,
                    "label": target.label,
                    "ok": False,
                    "error": "playwright_unavailable_gui_workspace_only",
                }
                unavailable_item = ContentRecord(
                    platform=config.platform,
                    source_account_url="",
                    source_content_url=target.url,
                    platform_content_id=infer_content_id(target.url),
                    caption=None,
                    publish_time_raw=None,
                    publish_time_iso=None,
                    duration_raw=None,
                    duration_sec=None,
                    comments=[],
                    field_source={"comments": "pending_playwright_unavailable"},
                )
                # Browser unavailability is not a terminal business skip. Preserve the
                # target as recoverable so a later Browser/Playwright run can continue.
                manifest.register_posts(target_key, [unavailable_item])
                manifest.mark_post_failed(target_key, unavailable_item, "playwright_unavailable_gui_workspace_only")
                manifest.mark_target_completed(target_key, status="ERROR", error="playwright_unavailable_gui_workspace_only")
                summary["ok"] = False
                summary["errors"].append(item_summary)
                summary["targets"].append(item_summary)
                _emit_target_event(
                    "error",
                    {
                        "type": "content",
                        "index": index,
                        "total": content_total,
                        "url": target.url,
                        "label": target.label,
                        "error": "Playwright browser unavailable in GUI workspace-only mode",
                    },
                )

        if config.target_mode == "content" and self.context is not None:
            comments_collector = adapter.create_comments_collector(self.context, self.output_dir, pacing_policy=pacing)
            speech_service = AccountSyncService(
                config.platform,
                self.context,
                self.output_dir,
                pacing_policy=pacing,
                core_client=self.core_client,
                robot_id=config.robot_id,
            )
            content_debug_dir = output_section_dir(self.output_dir, config.platform, config.account_alias, run_id, "content_sync")
            content_debug_dir.mkdir(parents=True, exist_ok=True)
            print(f"[PLAN] 监听作品访问顺序：{'随机' if config.randomize_targets else '按列表'}，本轮不重复，数量={content_total}", flush=True)
            for index, target in enumerate(content_targets, start=1):
                target_key = manifest.target_key_for("content", target.url, index)
                if manifest.is_target_complete(target_key):
                    print(f"[RECOVERY] 跳过已完成作品目标：{index}/{content_total} {target.url}", flush=True)
                    continue
                stop_controller.ensure_not_requested("content_target_start")
                manifest.mark_target_started(target_key)
                item_summary = {"type": "content", "index": index, "url": target.url, "label": target.label}
                target_deadline_at = time.time() + max(1, int(config.max_target_minutes * 60))
                _emit_target_event("start", {"type": "content", "index": index, "total": content_total, "url": target.url, "label": target.label})
                real_content_id = infer_content_id(target.url)
                debug_content_key = real_content_id or _safe_path_key(target.url, "content")
                debug_label = f"{index:03d}_{debug_content_key}"
                item = ContentRecord(
                    platform=config.platform,
                    source_account_url="",
                    source_content_url=target.url,
                    platform_content_id=real_content_id or None,
                    caption=None,
                    publish_time_raw=None,
                    publish_time_iso=None,
                    duration_raw=None,
                    duration_sec=None,
                    comments=[],
                    field_source={},
                )
                manifest.register_posts(target_key, [item])
                manifest.mark_post_started(target_key, item)
                try:
                    stop_controller.ensure_not_requested("content_before_speech")
                    remaining_before_speech = int(target_deadline_at - time.time())
                    if remaining_before_speech <= 0:
                        raise RuntimeError("direct content target time budget exhausted before speech analysis")
                    speech_debug_dir = content_debug_dir / "speech" / debug_label
                    _emit_target_event(
                        "speech_start",
                        {
                            "type": "content",
                            "parentType": "direct_content",
                            "index": index,
                            "total": content_total,
                            "url": target.url,
                            "label": target.label or f"{index}/{content_total}",
                        },
                    )
                    if config.speech_enabled is False:
                        speech_result = SpeechAnalysisResult(
                            status="DISABLED",
                            transcript="",
                            error="speech analysis disabled by robot config",
                            media_url="",
                            description="",
                            tags=[],
                            duration=None,
                        )
                        item.speech_status = "DISABLED"
                        item.speech_error = "speech analysis disabled by robot config"
                        item.speech_transcript = None
                    else:
                        try:
                            speech_result = speech_service.speech_analyzer.analyze(
                                target.url,
                                speech_debug_dir,
                                expected_content_id=real_content_id,
                                expected_caption=None,
                                source_account_url="",
                                max_runtime_seconds=remaining_before_speech,
                            )
                        except TypeError as exc:
                            if "unexpected keyword argument" not in str(exc):
                                raise
                            speech_result = speech_service.speech_analyzer.analyze(target.url, speech_debug_dir)
                        except Exception as exc:
                            speech_result = SpeechAnalysisResult(
                                status="FAILED",
                                transcript="",
                                error=str(exc),
                                media_url="",
                                description="",
                                tags=[],
                                duration=None,
                            )
                        speech_service._apply_speech_result(item, speech_result)
                        speech_page_url = getattr(speech_result, "page_url", "") or ""
                        speech_content_id = infer_content_id(speech_page_url)
                        if speech_content_id:
                            if item.platform_content_id != speech_content_id:
                                item.platform_content_id = speech_content_id
                            canonical_url = f"https://www.douyin.com/video/{speech_content_id}"
                            if item.source_content_url != canonical_url:
                                item.source_content_url = canonical_url
                                print(f"[STEP] 作品精准监听已解析真实作品地址：{index}/{content_total} {canonical_url}", flush=True)
                    speech_service._write_json(speech_debug_dir / "result.json", asdict(speech_result))
                    item.work_decision_status = "DIRECT_CONTENT_NO_DECISION"
                    item.work_decision_should_run = True
                    item.work_decision_reason = "作品精准监听模式不做是否继续判定，口播完成后直接采集评论"
                    decision_payload = {
                        "ok": True,
                        "should_collect_comments": True,
                        "reason": item.work_decision_reason,
                        "mode": "direct_content",
                    }
                    speech_service._write_speech_review_files(
                        item=item,
                        index=index,
                        speech_debug_dir=speech_debug_dir,
                        account_debug_dir=content_debug_dir,
                        speech_result=speech_result,
                        decision_payload=decision_payload,
                    )
                    cleanup_result = cleanup_speech_debug_dir(speech_debug_dir)
                    if cleanup_result.get("removed_bytes"):
                        print(
                            f"[CLEANUP] 已清理口播临时媒体：{cleanup_result.get('removed_mb')} MB，目录={speech_debug_dir}",
                            flush=True,
                        )
                    _emit_target_event(
                        "speech_done",
                        {
                            "type": "content",
                            "parentType": "direct_content",
                            "index": index,
                            "total": content_total,
                            "url": target.url,
                            "label": target.label or f"{index}/{content_total}",
                            "status": item.speech_status,
                            "error": item.speech_error,
                        },
                    )
                    stop_controller.ensure_not_requested("content_before_comments")
                    remaining_before_comments = int(target_deadline_at - time.time())
                    if remaining_before_comments <= 0:
                        raise RuntimeError("direct content target time budget exhausted before comment capture")
                    comment_runtime_seconds = remaining_before_comments
                    if config.comment_fetch_max_seconds > 0:
                        comment_runtime_seconds = min(comment_runtime_seconds, config.comment_fetch_max_seconds)
                    print(f"[STEP] 作品精准监听不做是否继续判定，直接进入评论采集：{index}/{content_total}", flush=True)
                    comment_url = item.source_content_url or target.url
                    print(f"[STEP] 开始采集作品评论：{index}/{content_total} {comment_url}，剩余预算={comment_runtime_seconds}s", flush=True)
                    comment_result, comment_summary_path = comments_collector.sync(
                        account_alias=config.account_alias,
                        content_url=comment_url,
                        max_comments_per_post=config.max_comments_per_post,
                        capture_seconds=config.capture_seconds,
                        save_debug_files=config.save_debug_files,
                        source_account_url="",
                        max_runtime_seconds=comment_runtime_seconds,
                        run_id=run_id,
                        debug_label=debug_label,
                        expected_author_nickname=target.label,
                        # 保留二级评论采集链路，当前产品要求先只抓一级评论。
                    # collect_replies=True,
                    collect_replies=False,
                    )
                    fetched_item = comment_result.items[0] if comment_result.items else None
                    comment_count = 0
                    if fetched_item:
                        item.comments = getattr(fetched_item, "comments", []) or []
                        comment_count = count_comment_tree(item.comments)
                        item.field_source = {**(item.field_source or {}), **(getattr(fetched_item, "field_source", None) or {})}
                        for attr in (
                            "caption",
                            "publish_time_raw",
                            "publish_time_iso",
                            "duration_raw",
                            "duration_sec",
                            "author_nickname",
                            "author_user_id",
                            "video_title",
                        ):
                            if not getattr(item, attr, None) and getattr(fetched_item, attr, None):
                                setattr(item, attr, getattr(fetched_item, attr))
                        fetched_content_id = getattr(fetched_item, "platform_content_id", None)
                        if fetched_content_id and item.platform_content_id != fetched_content_id:
                            item.platform_content_id = fetched_content_id
                        fetched_content_url = getattr(fetched_item, "source_content_url", None)
                        if fetched_content_url and item.source_content_url != fetched_content_url:
                            item.source_content_url = fetched_content_url
                    else:
                        item.field_source = {**(item.field_source or {}), "comments": "web_comment_api"}
                    append_unique_items([item])
                    manifest.mark_post_completed(target_key, item, status="COMPLETED")
                    manifest.mark_target_completed(target_key, status="COMPLETED")
                    if comment_count > 0:
                        print(
                            f"[STEP] 作品评论采集完成：{index}/{content_total} 评论数={comment_count} summary={comment_summary_path}",
                            flush=True,
                        )
                    else:
                        print(
                            f"[STEP] 作品评论采集未返回记录：{index}/{content_total} {target.url} summary={comment_summary_path}",
                            flush=True,
                        )
                    item_summary.update(
                        {
                            "ok": True,
                            "items_collected": 1,
                            "comments_collected": comment_count,
                            "summary_path": str(comment_summary_path),
                            "speech_status": item.speech_status,
                            "speech_error": item.speech_error,
                            "work_decision_status": item.work_decision_status,
                        }
                    )
                    _emit_target_event("done", {"type": "content", "index": index, "total": content_total, "url": target.url, "label": target.label, "items": 1, "comments": comment_count})
                except InterceptStopRequested as exc:
                    manifest.mark_post_failed(target_key, item, str(exc))
                    manifest.set_status("STOPPED", str(exc))
                    save_checkpoint(f"content_{index}_stopped")
                    raise
                except Exception as exc:
                    summary["ok"] = False
                    manifest.mark_post_failed(target_key, item, str(exc))
                    manifest.mark_target_completed(target_key, status="ERROR", error=str(exc))
                    item_summary.update({"ok": False, "error": str(exc)})
                    summary["errors"].append(item_summary)
                    _emit_target_event("error", {"type": "content", "index": index, "total": content_total, "url": target.url, "label": target.label, "error": str(exc)})
                summary["targets"].append(item_summary)
                save_checkpoint(f"content_{index}_done")
                if index < content_total:
                    cooldown_sec = _random_seconds(config.account_cooldown_min_sec, config.account_cooldown_max_sec)
                    item_summary["cooldown_after_target_sec"] = cooldown_sec
                    if cooldown_sec > 0:
                        stop_controller.ensure_not_requested("content_cooldown")
                        print(f"[STEP] 当前作品处理完成，休息 {cooldown_sec:.2f}s 后进入下一个作品。", flush=True)
                        sleep_interruptibly(cooldown_sec, "content_cooldown")

        unfinished_targets = manifest.unfinished_targets()
        manifest.set_status("RECOVERABLE" if unfinished_targets else "COMPLETED", "run_finished_with_pending_targets" if unfinished_targets else "run_completed")
        summary["recovery"]["manifestStatus"] = manifest.payload.get("status")
        summary["recovery"]["unfinishedTargets"] = unfinished_targets
        summary["items_collected"] = len(result.items)
        result.generated_at = datetime.now().astimezone().isoformat()
        json_path = result_store.save_nested_json(result)
        summary["json_path"] = str(json_path)
        cleanup_summary = cleanup_output_retention(self.output_dir, current_run_id=run_id, protected_run_ids=manifest.protected_output_run_ids())
        summary["cleanup"] = cleanup_summary
        if cleanup_summary.get("removed_bytes"):
            print(
                f"[CLEANUP] 已清理历史 output：{cleanup_summary.get('removed_mb')} MB，剩余约 {cleanup_summary.get('remaining_total_mb')} MB",
                flush=True,
            )
        summary_path = summary_dir / "summary.json"
        summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[RUN] 截流任务执行结束：items={len(result.items)} summary={summary_path}", flush=True)
        return result, json_path, summary_path
