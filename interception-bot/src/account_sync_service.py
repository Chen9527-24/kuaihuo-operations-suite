from __future__ import annotations

import csv
import json
import os
import re
import random
import time
import uuid
from dataclasses import asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Tuple

from playwright.sync_api import BrowserContext

from .models import CommentRecord, RunResult, count_comment_tree
from .pacing import CrawlPacingPolicy, sleep_seconds
from .platform_registry import get_platform_adapter
from .api_utils import aweme_id_to_iso
from .speech_analysis import SpeechAnalyzer, SpeechAnalysisResult
from .storage import cleanup_speech_debug_dir, output_section_dir
from .intercept_recovery import InterceptStopRequested


GUI_CONTENT_REQUEST_PREFIX = "[GUI_CONTENT_REQUEST]"



def _emit_target_event(event: str, payload: Dict[str, Any]) -> None:
    data = {"event": event, **payload}
    print("[TARGET] " + json.dumps(data, ensure_ascii=False), flush=True)

class AccountSyncService:
    def __init__(
        self,
        platform: str,
        context: BrowserContext | None,
        output_dir: Path,
        pacing_policy: CrawlPacingPolicy | None = None,
        speech_analyzer: SpeechAnalyzer | None = None,
        core_client: Any | None = None,
        robot_id: str | None = None,
    ):
        self.platform = platform
        self.context = context
        self.output_dir = output_dir
        self.adapter = get_platform_adapter(platform)
        self.pacing = pacing_policy or CrawlPacingPolicy()
        self.speech_analyzer = speech_analyzer or (SpeechAnalyzer(context=context, output_dir=output_dir) if context is not None else None)
        self.core_client = core_client
        self.robot_id = robot_id or ""

    def sync_account_api(
        self,
        account_alias: str,
        homepage_url: str,
        homepage_label: str | None = None,
        max_posts: int = 0,
        max_comments_per_post: int = 0,
        capture_seconds: int = 8,
        trigger_scroll_rounds: int = 4,
        trigger_pause_sec: float = 1.0,
        trigger_tab_click: bool = True,
        save_debug_files: bool = False,
        homepage_lookback_days: int | None = None,
        max_target_seconds: int | None = None,
        comment_fetch_max_seconds: int | None = None,
        max_post_duration_seconds: int | None = None,
        speech_enabled: bool = True,
        speech_fail_strategy: str = 'SKIP',
        speech_empty_transcript_strategy: str = 'SKIP',
        work_decision_enabled: bool = True,
        work_decision_workflow_id: str = '',
        work_decision_fail_strategy: str = 'SKIP',
        post_cooldown_min_sec: float | None = None,
        post_cooldown_max_sec: float | None = None,
        run_id: str | None = None,
        target_index: int | None = None,
        resume_items: List[Any] | None = None,
        progress_callback: Callable[[str, Dict[str, Any]], None] | None = None,
        stop_check: Callable[[], bool] | None = None,
    ) -> Tuple[RunResult, Path]:
        posts_collector = self.adapter.create_posts_collector(
            self.context,
            self.output_dir,
            pacing_policy=self.pacing,
        )
        comments_collector = self.adapter.create_comments_collector(
            self.context,
            self.output_dir,
            pacing_policy=self.pacing,
        )

        def ensure_not_stopped(stage: str) -> None:
            if stop_check is not None and stop_check():
                raise InterceptStopRequested(f"截流任务收到安全停止请求，阶段={stage}")

        def sleep_interruptibly(seconds: float, stage: str) -> None:
            """Preserve pacing while allowing the intercept stop request to take effect promptly."""
            remaining = max(float(seconds or 0), 0.0)
            while remaining > 0:
                ensure_not_stopped(stage)
                chunk = min(0.5, remaining)
                time.sleep(chunk)
                remaining -= chunk
            ensure_not_stopped(stage)

        def notify(event: str, item: Any | None = None, **payload: Any) -> None:
            if progress_callback is None:
                return
            data: Dict[str, Any] = {"homepage_url": homepage_url, "target_index": target_index or 0, **payload}
            if item is not None:
                data["item"] = item
            try:
                progress_callback(event, data)
            except Exception as callback_exc:
                print(f"[RECOVERY] 运行断点写入失败，继续当前采集：event={event} error={callback_exc}", flush=True)

        deadline_at = time.time() + max_target_seconds if max_target_seconds and max_target_seconds > 0 else None
        resume_mode = resume_items is not None
        print(f"[STEP] {'从断点恢复主页作品' if resume_mode else '主页采集开始'}：{homepage_url}", flush=True)
        notify("target_heartbeat", stage="homepage_prepare")

        posts_fetch_limit = self._resolve_homepage_posts_fetch_limit(max_posts, homepage_lookback_days)
        if posts_fetch_limit != max_posts:
            print(
                f"[STEP] 主页模式已启用时间过滤，作品列表会先扩大采样：最终最多处理={max_posts or '不限'}，列表采样上限={posts_fetch_limit or '不限'}",
                flush=True,
            )

        try:
            ensure_not_stopped("homepage_posts_prepare")
            if resume_mode:
                resumed_run_id = str(run_id or datetime.now().strftime("%Y%m%d_%H%M%S"))
                posts_result = RunResult(
                    run_id=resumed_run_id,
                    platform=self.platform,
                    homepage_url=homepage_url,
                    account_alias=account_alias,
                    generated_at=datetime.now().astimezone().isoformat(),
                    items=list(resume_items or []),
                )
                resume_marker_dir = output_section_dir(self.output_dir, self.platform, account_alias, resumed_run_id, "account_sync")
                resume_marker_dir.mkdir(parents=True, exist_ok=True)
                posts_summary_path = resume_marker_dir / "resume_posts_plan.json"
                posts_summary_path.write_text(
                    json.dumps({"resumed": True, "homepage_url": homepage_url, "pending_posts": len(posts_result.items)}, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                print(f"[RECOVERY] 已加载本地未完成作品断点：待恢复作品数={len(posts_result.items)}", flush=True)
            else:
                posts_result, posts_summary_path = posts_collector.sync(
                    account_alias=account_alias,
                    homepage_url=homepage_url,
                    max_posts=posts_fetch_limit,
                    capture_seconds=capture_seconds,
                    trigger_scroll_rounds=trigger_scroll_rounds,
                    trigger_pause_sec=trigger_pause_sec,
                    trigger_tab_click=trigger_tab_click,
                    save_debug_files=save_debug_files,
                    run_id=run_id,
                )
        except Exception as exc:
            print(f"[STEP] 主页作品列表采集异常，跳过当前监听账号：{homepage_url}，error={exc}", flush=True)
            notify("target_failed", error=str(exc))
            raise

        original_posts_count = len(posts_result.items)
        print(f"[STEP] 主页作品列表采集完成：{homepage_url}，作品数={original_posts_count}，summary={posts_summary_path}", flush=True)
        before_filter_count = len(posts_result.items)
        lookback_filter_applied = False
        lookback_filter_fallback = False
        lookback_filter_debug = None

        duration_filter_debug = None
        if (not resume_mode) and max_post_duration_seconds and max_post_duration_seconds > 0:
            before_duration_filter_count = len(posts_result.items)
            posts_result.items, duration_filter_debug = self._filter_items_by_duration_with_debug(
                posts_result.items,
                int(max_post_duration_seconds),
            )
            print(
                f"[STEP] 主页作品时长过滤：最长={int(max_post_duration_seconds)}秒，过滤前={before_duration_filter_count}，"
                f"过滤后={len(posts_result.items)}，保留无时长={duration_filter_debug['kept_missing_duration']}，"
                f"保留解析失败={duration_filter_debug['kept_parse_failed']}，保留范围内={duration_filter_debug['kept_in_range']}，"
                f"过滤超时长={duration_filter_debug['dropped_over_duration']}",
                flush=True,
            )
            if duration_filter_debug.get("samples"):
                print("[STEP] 主页作品时长判定样例：" + json.dumps(duration_filter_debug["samples"], ensure_ascii=False), flush=True)

        before_filter_count = len(posts_result.items)
        if (not resume_mode) and homepage_lookback_days and homepage_lookback_days > 0:
            lookback_filter_applied = True
            print(
                f"[STEP] 主页作品筛选配置：只采集最近={homepage_lookback_days}天内作品，最终处理上限={max_posts or '不限'}，"
                f"列表采样上限={posts_fetch_limit or '不限'}，无发布时间=保留，解析失败=保留，过期作品=过滤，不做兜底回退",
                flush=True,
            )
            filtered_items, filter_debug = self._filter_items_by_lookback_with_debug(
                posts_result.items,
                homepage_lookback_days,
            )
            lookback_filter_debug = filter_debug
            posts_result.items = filtered_items
            print(
                f"[STEP] 主页作品时间过滤：范围={homepage_lookback_days}天内，过滤前={before_filter_count}，过滤后={len(posts_result.items)}，"
                f"保留无时间={filter_debug['kept_missing_time']}，保留解析失败={filter_debug['kept_parse_failed']}，"
                f"保留范围内={filter_debug['kept_in_range']}，任一时间源命中保留={filter_debug['kept_by_any_time_candidate']}，"
                f"ID时间命中保留={filter_debug['kept_corrected_by_aweme_id']}，时间源不一致={filter_debug['time_source_mismatch']}，"
                f"过滤过期={filter_debug['dropped_expired']}，过滤异常时间={filter_debug['dropped_future_invalid']}，cutoff={filter_debug['cutoff']}",
                flush=True,
            )
            if filter_debug.get("samples"):
                print(
                    "[STEP] 主页作品时间判定样例：" + json.dumps(filter_debug["samples"], ensure_ascii=False),
                    flush=True,
                )

            if before_filter_count > 0 and len(posts_result.items) == 0:
                print(
                    "[STEP] 主页作品时间过滤后为0：当前主页没有符合配置时间范围的作品，本次按配置不进入评论采集。",
                    flush=True,
                )

        if max_posts and max_posts > 0 and len(posts_result.items) > max_posts:
            posts_result.items = posts_result.items[:max_posts]
            print(f"[STEP] 主页作品处理上限：本次最多处理={max_posts}，最终待采集评论={len(posts_result.items)}", flush=True)
        else:
            print(f"[STEP] 主页作品待采集评论数量：{len(posts_result.items)}", flush=True)
        if before_filter_count > 0 and len(posts_result.items) == 0:
            print(
                "[STEP] 当前主页没有进入评论采集阶段：作品列表为空。",
                flush=True,
            )

        account_run_id = posts_result.run_id
        account_debug_dir = output_section_dir(self.output_dir, self.platform, account_alias, account_run_id, "account_sync")
        account_debug_dir.mkdir(parents=True, exist_ok=True)
        if not resume_mode:
            notify("posts_discovered", items=list(posts_result.items))
        else:
            notify("posts_resumed", items=list(posts_result.items))

        for _item in posts_result.items:
            self._apply_homepage_identity(_item, homepage_url=homepage_url, homepage_label=homepage_label)

        items_summary: List[Dict[str, object]] = []

        if self.context is None:
            print(
                "[STEP] Playwright browser is unavailable and automatic install is disabled; "
                "using GUI workspace content bridge for visible text, work decision, and comments.",
                flush=True,
            )
            for idx, item in enumerate(posts_result.items, start=1):
                ensure_not_stopped("gui_workspace_post_start")
                content_url = item.source_content_url
                total_posts = len(posts_result.items)
                debug_label = f"{idx:03d}_{item.platform_content_id or 'content'}"
                detail_debug_dir = account_debug_dir / "gui_content" / debug_label
                notify("post_started", item=item, index=idx, total=total_posts)
                notify("stage", item=item, stage="speech_start", index=idx, total=total_posts)
                _emit_target_event(
                    "speech_start",
                    {
                        "type": "content",
                        "parentType": "homepage",
                        "index": idx,
                        "total": total_posts,
                        "url": content_url,
                        "label": f"{idx}/{total_posts}",
                    },
                )
                detail = self._collect_gui_workspace_content_detail(
                    item=item,
                    debug_dir=detail_debug_dir,
                    max_comments_per_post=max_comments_per_post,
                    trigger_scroll_rounds=trigger_scroll_rounds,
                    trigger_pause_sec=trigger_pause_sec,
                )
                self._apply_gui_content_detail(item, detail, homepage_url)
                _emit_target_event(
                    "speech_done",
                    {
                        "type": "content",
                        "parentType": "homepage",
                        "index": idx,
                        "total": total_posts,
                        "url": content_url,
                        "label": f"{idx}/{total_posts}",
                        "status": item.speech_status,
                        "error": item.speech_error,
                    },
                )
                should_collect_comments = True
                if item.speech_status in {"SUCCESS", "GUI_TEXT_ONLY"}:
                    _emit_target_event(
                        "decision_start",
                        {
                            "type": "content",
                            "parentType": "homepage",
                            "index": idx,
                            "total": total_posts,
                            "url": content_url,
                            "label": f"{idx}/{total_posts}",
                        },
                    )
                    if work_decision_enabled is False:
                        item.work_decision_status = "DISABLED"
                        item.work_decision_should_run = True
                        item.work_decision_reason = "work decision disabled by robot config"
                        decision_payload = {"ok": True, "should_collect_comments": True, "reason": item.work_decision_reason}
                    else:
                        decision_payload = self._run_work_decision(item, fail_strategy=work_decision_fail_strategy, workflow_id=work_decision_workflow_id)
                    should_collect_comments = decision_payload.get("should_collect_comments", True) is not False
                    self._write_json(detail_debug_dir / "work_decision.json", decision_payload)
                    _emit_target_event(
                        "decision_done",
                        {
                            "type": "content",
                            "parentType": "homepage",
                            "index": idx,
                            "total": total_posts,
                            "url": content_url,
                            "label": f"{idx}/{total_posts}",
                            "status": item.work_decision_status,
                            "shouldRun": item.work_decision_should_run,
                            "reason": item.work_decision_reason,
                        },
                    )
                else:
                    failure_reason = item.speech_error or "GUI workspace content detail failed"
                    is_empty_transcript = "empty" in str(failure_reason).lower() or "为空" in str(failure_reason)
                    strategy = speech_empty_transcript_strategy if is_empty_transcript else speech_fail_strategy
                    if str(strategy or '').upper() == 'RUN':
                        should_collect_comments = True
                        item.work_decision_status = "SPEECH_FAILED_CONTINUE"
                        item.work_decision_should_run = True
                        item.work_decision_reason = f"speech_failed_continue: {failure_reason}"
                    else:
                        should_collect_comments = False
                        item.work_decision_status = "FAILED_SKIP"
                        item.work_decision_should_run = False
                        item.work_decision_reason = failure_reason
                if not should_collect_comments:
                    item.comments = []
                    print(
                        f"[STEP] GUI workspace work decision skipped comments: {idx}/{total_posts} reason={item.work_decision_reason or ''}",
                        flush=True,
                    )
                # Persist the usable result before writing logs/UI summaries so a forced close
                # does not cause the same comment capture to run again on recovery.
                notify("post_completed", item=item, status=("COMPLETED" if should_collect_comments else "SKIPPED"), index=idx, total=total_posts)
                print(
                    f"[STEP] GUI workspace content processed: {idx}/{total_posts} comments={count_comment_tree(item.comments or [])} "
                    f"speechStatus={item.speech_status or '-'} decision={item.work_decision_status or '-'}",
                    flush=True,
                )
                comment_count = count_comment_tree(item.comments or [])
                self._append_operation_log(
                    account_debug_dir=account_debug_dir,
                    homepage_url=homepage_url,
                    homepage_label=homepage_label,
                    item=item,
                    index=idx,
                    total=total_posts,
                    comment_count=comment_count,
                    skipped=not should_collect_comments,
                )
                items_summary.append(
                    self._build_item_summary(
                        item,
                        idx,
                        comment_count=comment_count,
                        pages_fetched=1 if detail.get("ok") else 0,
                        cooldown_sec=0.0,
                        comments_summary_path=str(detail.get("output_path") or ""),
                    )
                )
            summary = {
                "run_id": account_run_id,
                "robot_id": self.robot_id or "",
                "platform": self.platform,
                "account_alias": account_alias,
                "homepage_url": homepage_url,
                "ok": True,
                "reason": "gui_workspace_content_bridge",
                "posts_summary_path": str(posts_summary_path),
                "posts_collected": len(posts_result.items),
                "comments_limit_per_post": None if max_comments_per_post <= 0 else max_comments_per_post,
                "items": items_summary,
            }
            summary_path = account_debug_dir / "summary.json"
            summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"[STEP] GUI workspace-only homepage collection finished: posts={len(posts_result.items)} summary={summary_path}", flush=True)
            return posts_result, summary_path

        for idx, item in enumerate(posts_result.items, start=1):
            ensure_not_stopped("post_start")
            if deadline_at and time.time() >= deadline_at:
                print(f"[STEP] 当前主页已到达单目标最长处理时间，停止后续作品评论采集：{homepage_url}", flush=True)
                break
            remaining_seconds = int(deadline_at - time.time()) if deadline_at else None
            content_url = item.source_content_url
            total_posts = len(posts_result.items)
            debug_label = f"{idx:03d}_{item.platform_content_id or 'content'}"
            speech_debug_dir = account_debug_dir / "speech" / debug_label
            notify("post_started", item=item, index=idx, total=total_posts)
            notify("stage", item=item, stage="speech_start", index=idx, total=total_posts)
            _emit_target_event(
                "speech_start",
                {
                    "type": "content",
                    "parentType": "homepage",
                    "index": idx,
                    "total": total_posts,
                    "url": content_url,
                    "label": f"{idx}/{total_posts}",
                },
            )
            ensure_not_stopped("before_speech")
            if speech_enabled is False:
                speech_result = SpeechAnalysisResult(status='DISABLED', transcript='', error='speech analysis disabled by robot config', media_url='', description=getattr(item, 'caption', None) or '', tags=[], duration=getattr(item, 'duration_sec', None))
                item.speech_status = 'DISABLED'
                item.speech_error = 'speech analysis disabled by robot config'
                item.speech_transcript = None
                item.video_description = getattr(item, 'caption', None) or None
                item.video_tags = []
            else:
                try:
                    speech_result = self.speech_analyzer.analyze(
                        content_url,
                        speech_debug_dir,
                        expected_content_id=getattr(item, "platform_content_id", None),
                        expected_caption=getattr(item, "caption", None),
                        source_account_url=getattr(item, "source_account_url", None),
                        max_runtime_seconds=remaining_seconds,
                    )
                except TypeError as exc:
                    if "unexpected keyword argument" not in str(exc):
                        raise
                    # Unit-test fakes and older custom analyzers may still expose the old two-argument signature.
                    speech_result = self.speech_analyzer.analyze(content_url, speech_debug_dir)
                self._apply_speech_result(item, speech_result)
            self._write_json(speech_debug_dir / "result.json", asdict(speech_result))
            notify("stage", item=item, stage="speech_done", index=idx, total=total_posts, status=item.speech_status or "")
            _emit_target_event(
                "speech_done",
                {
                    "type": "content",
                    "parentType": "homepage",
                    "index": idx,
                    "total": total_posts,
                    "url": content_url,
                    "label": f"{idx}/{total_posts}",
                    "status": item.speech_status,
                    "error": item.speech_error,
                },
            )

            ensure_not_stopped("after_speech")
            should_collect_comments = True
            decision_payload: Dict[str, Any] = {}
            if speech_result.status == "SUCCESS":
                notify("stage", item=item, stage="decision_start", index=idx, total=total_posts)
                _emit_target_event(
                    "decision_start",
                    {
                        "type": "content",
                        "parentType": "homepage",
                        "index": idx,
                        "total": total_posts,
                        "url": content_url,
                        "label": f"{idx}/{total_posts}",
                    },
                )
                if work_decision_enabled is False:
                    item.work_decision_status = "DISABLED"
                    item.work_decision_should_run = True
                    item.work_decision_reason = "work decision disabled by robot config"
                    decision_payload = {"ok": True, "should_collect_comments": True, "reason": item.work_decision_reason}
                else:
                    decision_payload = self._run_work_decision(item, fail_strategy=work_decision_fail_strategy, workflow_id=work_decision_workflow_id)
                should_collect_comments = decision_payload.get("should_collect_comments", True) is not False
                self._write_json(speech_debug_dir / "work_decision.json", decision_payload)
                notify("stage", item=item, stage="decision_done", index=idx, total=total_posts, status=item.work_decision_status or "")
                _emit_target_event(
                    "decision_done",
                    {
                        "type": "content",
                        "parentType": "homepage",
                        "index": idx,
                        "total": total_posts,
                        "url": content_url,
                        "label": f"{idx}/{total_posts}",
                        "status": item.work_decision_status,
                        "shouldRun": item.work_decision_should_run,
                        "reason": item.work_decision_reason,
                    },
                )
            elif speech_result.status == "DISABLED":
                should_collect_comments = True
                item.work_decision_status = "SPEECH_DISABLED_CONTINUE"
                item.work_decision_should_run = True
                item.work_decision_reason = "speech analysis disabled; continue comment capture"
            else:
                failure_reason = speech_result.error or 'speech analysis failed'
                is_empty_transcript = 'transcript is empty' in str(failure_reason).lower() or 'empty' in str(failure_reason).lower()
                strategy = speech_empty_transcript_strategy if is_empty_transcript else speech_fail_strategy
                if str(strategy or '').upper() == 'RUN':
                    should_collect_comments = True
                    item.work_decision_status = "SPEECH_FAILED_CONTINUE"
                    item.work_decision_should_run = True
                    item.work_decision_reason = f"speech_failed_continue: {failure_reason}"
                else:
                    should_collect_comments = False
                    item.work_decision_status = "FAILED_SKIP"
                    item.work_decision_should_run = False
                    item.work_decision_reason = f"speech_failed_skip: {failure_reason}"

            self._write_speech_review_files(
                item=item,
                index=idx,
                speech_debug_dir=speech_debug_dir,
                account_debug_dir=account_debug_dir,
                speech_result=speech_result,
                decision_payload=decision_payload,
            )
            cleanup_result = cleanup_speech_debug_dir(speech_debug_dir)
            if cleanup_result.get("removed_bytes"):
                print(
                    f"[CLEANUP] 已清理口播临时媒体：{cleanup_result.get('removed_mb')} MB，目录={speech_debug_dir}",
                    flush=True,
                )

            if not should_collect_comments:
                print(
                    f"[STEP] 作品前置判定为不继续，跳过评论采集：{idx}/{total_posts} reason={item.work_decision_reason or ''}",
                    flush=True,
                )
                _emit_target_event(
                    "done",
                    {
                        "type": "content",
                        "parentType": "homepage",
                        "index": idx,
                        "total": total_posts,
                        "url": content_url,
                        "label": f"{idx}/{total_posts}",
                        "items": 1,
                        "comments": 0,
                        "skipped": True,
                    },
                )
                # The decision is final at this point. Checkpoint before cooldown/log I/O
                # so recovery will not re-run an already classified work.
                notify("post_completed", item=item, status="SKIPPED", index=idx, total=total_posts)
                cooldown_sec = 0.0
                if idx < len(posts_result.items):
                    cooldown_sec = self._resolve_post_cooldown(
                        comment_count=0,
                        comment_pages_fetched=0,
                        min_sec=post_cooldown_min_sec,
                        max_sec=post_cooldown_max_sec,
                    )
                    if cooldown_sec > 0:
                        print(f"[STEP] 跳过当前作品后休息 {cooldown_sec:.2f}s，再进入下一个作品。", flush=True)
                        sleep_interruptibly(cooldown_sec, "post_skip_cooldown")
                self._append_operation_log(
                    account_debug_dir=account_debug_dir,
                    homepage_url=homepage_url,
                    homepage_label=homepage_label,
                    item=item,
                    index=idx,
                    total=total_posts,
                    comment_count=0,
                    skipped=True,
                )
                items_summary.append(
                    self._build_item_summary(
                        item,
                        idx,
                        comment_count=0,
                        pages_fetched=0,
                        cooldown_sec=cooldown_sec,
                    )
                )
                continue
            ensure_not_stopped("before_comments")
            print(f"[STEP] 开始采集作品评论：{idx}/{total_posts} {content_url}", flush=True)
            notify("stage", item=item, stage="comments_start", index=idx, total=total_posts)
            _emit_target_event(
                "start",
                {
                    "type": "content",
                    "parentType": "homepage",
                    "index": idx,
                    "total": total_posts,
                    "url": content_url,
                    "label": f"{idx}/{total_posts}",
                },
            )
            comment_runtime_seconds = self._resolve_comment_runtime_seconds(remaining_seconds, comment_fetch_max_seconds)
            try:
                comment_result, comment_summary_path = comments_collector.sync(
                    account_alias=account_alias,
                    content_url=content_url,
                    max_comments_per_post=max_comments_per_post,
                    capture_seconds=capture_seconds,
                    save_debug_files=save_debug_files,
                    source_account_url=homepage_url,
                    max_runtime_seconds=comment_runtime_seconds,
                    run_id=account_run_id,
                    debug_label=debug_label,
                    expected_author_nickname=getattr(item, "author_nickname", None) or homepage_label,
                    # 保留二级评论采集链路，当前产品要求先只抓一级评论。
                    # collect_replies=True,
                    collect_replies=False,
                )
            except Exception as exc:
                _emit_target_event(
                    "error",
                    {
                        "type": "content",
                        "parentType": "homepage",
                        "index": idx,
                        "total": total_posts,
                        "url": content_url,
                        "label": f"{idx}/{total_posts}",
                        "error": str(exc),
                    },
                )
                notify("post_failed", item=item, error=str(exc), index=idx, total=total_posts)
                raise

            fetched_item = comment_result.items[0] if comment_result.items else None
            comment_count = count_comment_tree(fetched_item.comments) if fetched_item else 0
            if fetched_item:
                item.comments = fetched_item.comments
                print(f"[STEP] 作品评论采集完成：{idx}/{total_posts} 评论数={comment_count} summary={comment_summary_path}", flush=True)
                if not item.source_account_url:
                    item.source_account_url = homepage_url
                item.field_source = {**(item.field_source or {}), **(fetched_item.field_source or {})}
            else:
                print(f"[STEP] 作品评论采集未返回记录：{idx}/{total_posts} {content_url} summary={comment_summary_path}", flush=True)
            _emit_target_event(
                "done",
                {
                    "type": "content",
                    "parentType": "homepage",
                    "index": idx,
                    "total": total_posts,
                    "url": content_url,
                    "label": f"{idx}/{total_posts}",
                    "items": 1 if fetched_item else 0,
                    "comments": comment_count,
                },
            )

            summary_payload = self._load_json(comment_summary_path)
            pages_fetched = int(summary_payload.get("pages_fetched") or 1) if isinstance(summary_payload, dict) else 1
            # Comments are now attached to item; make this the recovery boundary before
            # optional pacing/logging work.
            notify("post_completed", item=item, status="COMPLETED", index=idx, total=total_posts)
            cooldown_sec = 0.0
            if idx < len(posts_result.items):
                cooldown_sec = self._resolve_post_cooldown(
                    comment_count=comment_count,
                    comment_pages_fetched=pages_fetched,
                    min_sec=post_cooldown_min_sec,
                    max_sec=post_cooldown_max_sec,
                )
                if cooldown_sec > 0:
                    print(f"[STEP] 单个作品处理完成，休息 {cooldown_sec:.2f}s 后进入下一个作品。", flush=True)
                    sleep_interruptibly(cooldown_sec, "post_cooldown")

            self._append_operation_log(
                account_debug_dir=account_debug_dir,
                homepage_url=homepage_url,
                homepage_label=homepage_label,
                item=item,
                index=idx,
                total=total_posts,
                comment_count=comment_count,
                skipped=False,
            )
            items_summary.append(
                self._build_item_summary(
                    item,
                    idx,
                    comment_count=comment_count,
                    pages_fetched=pages_fetched,
                    cooldown_sec=cooldown_sec,
                    comments_summary_path=str(comment_summary_path),
                )
            )

        posts_result.homepage_url = homepage_url
        posts_result.generated_at = datetime.now().astimezone().isoformat()

        summary = {
            "run_id": account_run_id,
            "robot_id": self.robot_id or "",
            "platform": self.platform,
            "account_alias": account_alias,
            "homepage_url": homepage_url,
            "ok": True,
            "pacing_profile": self.pacing.profile_name,
            "posts_summary_path": str(posts_summary_path),
            "posts_collected": len(posts_result.items),
            "posts_collected_before_lookback_filter": original_posts_count,
            "posts_fetch_limit": posts_fetch_limit,
            "homepage_lookback_days": homepage_lookback_days,
            "max_post_duration_seconds": max_post_duration_seconds or 0,
            "duration_filter_debug": duration_filter_debug,
            "lookback_filter_applied": lookback_filter_applied,
            "lookback_filter_fallback": lookback_filter_fallback,
            "lookback_filter_debug": lookback_filter_debug,
            "comments_limit_per_post": None if max_comments_per_post <= 0 else max_comments_per_post,
            "comment_fetch_max_seconds": comment_fetch_max_seconds or 0,
            "post_cooldown_sec": {"min": post_cooldown_min_sec, "max": post_cooldown_max_sec},
            "comment_page_pause_sec": {
                "min": getattr(self.pacing, "comment_page_pause_min_sec", None),
                "max": getattr(self.pacing, "comment_page_pause_max_sec", None),
            },
            "items": items_summary,
        }
        summary_path = account_debug_dir / "summary.json"
        summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[STEP] 主页采集结束：{homepage_url}，作品数={len(posts_result.items)}，summary={summary_path}", flush=True)
        return posts_result, summary_path

    def _collect_gui_workspace_content_detail(
        self,
        item: Any,
        debug_dir: Path,
        max_comments_per_post: int,
        trigger_scroll_rounds: int,
        trigger_pause_sec: float,
    ) -> Dict[str, Any]:
        debug_dir.mkdir(parents=True, exist_ok=True)
        request_id = uuid.uuid4().hex[:12]
        output_path = (debug_dir / f"gui_content_{request_id}.json").resolve()
        max_comments = max_comments_per_post if max_comments_per_post and max_comments_per_post > 0 else 50
        payload = {
            "request_id": request_id,
            "url": getattr(item, "source_content_url", "") or "",
            "output_path": str(output_path),
            "max_comments": max_comments,
            "scroll_rounds": max(trigger_scroll_rounds or 4, 1),
            "pause_ms": max(int((trigger_pause_sec or 1.0) * 1000), 700),
        }
        print(f"{GUI_CONTENT_REQUEST_PREFIX} {json.dumps(payload, ensure_ascii=False)}", flush=True)
        deadline = time.time() + max(20.0, min(180.0, (payload["scroll_rounds"] + 3) * (payload["pause_ms"] / 1000.0 + 1.8)))
        while time.time() < deadline:
            if output_path.exists():
                try:
                    data = json.loads(output_path.read_text(encoding="utf-8"))
                    if isinstance(data, dict):
                        data["output_path"] = str(output_path)
                        return data
                except Exception as exc:
                    return {"ok": False, "reason": f"gui_content_result_parse_failed: {exc}", "comments": []}
            time.sleep(0.25)
        return {"ok": False, "reason": "gui_content_request_timeout", "comments": [], "output_path": str(output_path)}

    def _apply_gui_content_detail(self, item: Any, detail: Dict[str, Any], homepage_url: str) -> None:
        title = self._clean_detail_text(detail.get("caption") or detail.get("title"))
        description = self._clean_detail_text(detail.get("description"))
        transcript = self._clean_detail_text(detail.get("transcript") or description or title or getattr(item, "caption", None))
        if title:
            item.video_title = title
        if title and not getattr(item, "caption", None):
            item.caption = title
        if detail.get("publish_time_raw") and not getattr(item, "publish_time_raw", None):
            item.publish_time_raw = str(detail.get("publish_time_raw") or "")
        if detail.get("duration") is not None and not getattr(item, "duration_sec", None):
            try:
                item.duration_sec = int(float(detail.get("duration")))
            except Exception:
                pass
        item.video_description = description or title or getattr(item, "video_description", None)
        tags = detail.get("tags")
        if isinstance(tags, list):
            item.video_tags = [str(tag).strip() for tag in tags if str(tag).strip()]
        if transcript:
            item.speech_status = "GUI_TEXT_ONLY"
            item.speech_transcript = transcript
            item.speech_error = None
        else:
            item.speech_status = "FAILED"
            item.speech_error = str(detail.get("reason") or "GUI workspace did not return visible text")
        comments = detail.get("comments") if isinstance(detail, dict) else []
        item.comments = [
            self._build_gui_comment_record(raw, item, homepage_url)
            for raw in (comments if isinstance(comments, list) else [])
            if isinstance(raw, dict) and self._clean_detail_text(raw.get("comment_text"))
        ]
        field_source = getattr(item, "field_source", None) or {}
        field_source["speech"] = "gui_workspace_visible_text"
        field_source["comments"] = "gui_workspace_dom"
        field_source["video_description"] = "gui_workspace_meta"
        item.field_source = field_source

    def _build_gui_comment_record(self, raw: Dict[str, Any], item: Any, homepage_url: str) -> CommentRecord:
        return CommentRecord(
            comment_id=self._clean_detail_text(raw.get("comment_id")) or None,
            parent_comment_id=self._clean_detail_text(raw.get("parent_comment_id")) or None,
            user_id=self._clean_detail_text(raw.get("user_id")) or None,
            nickname=self._clean_detail_text(raw.get("nickname")) or None,
            comment_text=self._clean_detail_text(raw.get("comment_text")) or None,
            comment_time_raw=self._clean_detail_text(raw.get("comment_time_raw")) or None,
            comment_time_iso=self._clean_detail_text(raw.get("comment_time_iso")) or None,
            visible_region=self._clean_detail_text(raw.get("visible_region")) or None,
            source_account_url=homepage_url,
            source_content_url=getattr(item, "source_content_url", "") or "",
            platform=self.platform,
            comment_type=self._clean_detail_text(raw.get("comment_type")) or "text",
            has_media=bool(raw.get("has_media")),
            media_urls=[str(url).strip() for url in (raw.get("media_urls") if isinstance(raw.get("media_urls"), list) else []) if str(url).strip()],
            replies=[],
        )

    def _clean_detail_text(self, value: Any) -> str:
        if value is None:
            return ""
        return " ".join(str(value).split()).strip()

    def _write_speech_review_files(
        self,
        item: Any,
        index: int,
        speech_debug_dir: Path,
        account_debug_dir: Path,
        speech_result: SpeechAnalysisResult,
        decision_payload: Dict[str, Any] | None = None,
    ) -> None:
        review = self._build_speech_review_payload(item, index, speech_debug_dir, speech_result, decision_payload or {})
        try:
            self._write_json(speech_debug_dir / "speech_review.json", review)
            (speech_debug_dir / "speech_review.txt").write_text(self._format_speech_review_text(review), encoding="utf-8")
        except Exception:
            pass
        try:
            review_dir = account_debug_dir.parent / "speech_review"
            review_dir.mkdir(parents=True, exist_ok=True)
            jsonl_path = review_dir / "speech_review.jsonl"
            with jsonl_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(review, ensure_ascii=False) + "\n")
            csv_path = review_dir / "speech_review.csv"
            fieldnames = [
                "index",
                "platform_content_id",
                "source_content_url",
                "caption",
                "publish_time_iso",
                "speech_status",
                "speech_error",
                "speech_transcript",
                "speech_transcript_chars",
                "video_description",
                "video_tags",
                "media_url",
                "media_file",
                "audio_file",
                "transcript_file",
                "work_decision_status",
                "work_decision_should_run",
                "work_decision_reason",
                "work_decision_workflow_id",
                "speech_debug_dir",
            ]
            write_header = not csv_path.exists()
            with csv_path.open("a", encoding="utf-8-sig", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
                if write_header:
                    writer.writeheader()
                row = {key: review.get(key, "") for key in fieldnames}
                row["video_tags"] = "、".join(review.get("video_tags") or [])
                writer.writerow(row)
            print(f"[SPEECH_REVIEW] 已输出口播核验数据：{speech_debug_dir / 'speech_review.json'}", flush=True)
            print(f"[SPEECH_REVIEW] 汇总表：{csv_path}", flush=True)
        except Exception as exc:
            print(f"[SPEECH_REVIEW] WARN 输出口播核验数据失败：{exc}", flush=True)

    def _build_speech_review_payload(
        self,
        item: Any,
        index: int,
        speech_debug_dir: Path,
        speech_result: SpeechAnalysisResult,
        decision_payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        media_file = speech_debug_dir / "source_playwright.mp4"
        audio_file = speech_debug_dir / "audio.mp3"
        transcript_file = speech_debug_dir / "transcript.txt"
        return {
            "index": index,
            "platform": self.platform,
            "platform_content_id": getattr(item, "platform_content_id", None),
            "source_account_url": getattr(item, "source_account_url", None),
            "source_content_url": getattr(item, "source_content_url", None),
            "caption": getattr(item, "caption", None),
            "publish_time_raw": getattr(item, "publish_time_raw", None),
            "publish_time_iso": getattr(item, "publish_time_iso", None),
            "duration_raw": getattr(item, "duration_raw", None),
            "duration_sec": getattr(item, "duration_sec", None),
            "speech_status": getattr(item, "speech_status", None),
            "speech_error": getattr(item, "speech_error", None),
            "speech_transcript": getattr(item, "speech_transcript", None) or "",
            "speech_transcript_chars": len(getattr(item, "speech_transcript", None) or ""),
            "video_description": getattr(item, "video_description", None) or "",
            "video_tags": getattr(item, "video_tags", []) or [],
            "media_url": speech_result.media_url or "",
            "media_file": str(media_file) if media_file.exists() else "",
            "audio_file": str(audio_file) if audio_file.exists() else "",
            "transcript_file": str(transcript_file) if transcript_file.exists() else "",
            "work_decision_status": getattr(item, "work_decision_status", None),
            "work_decision_should_run": getattr(item, "work_decision_should_run", None),
            "work_decision_reason": getattr(item, "work_decision_reason", None),
            "work_decision_workflow_id": getattr(item, "work_decision_workflow_id", None),
            "decision_payload": decision_payload,
            "speech_debug_dir": str(speech_debug_dir),
            "field_source": getattr(item, "field_source", None) or {},
        }

    def _format_speech_review_text(self, review: Dict[str, Any]) -> str:
        tags = review.get("video_tags") or []
        return "\n".join(
            [
                f"作品ID：{review.get('platform_content_id') or ''}",
                f"作品链接：{review.get('source_content_url') or ''}",
                f"标题/Caption：{review.get('caption') or ''}",
                f"发布时间：{review.get('publish_time_iso') or review.get('publish_time_raw') or ''}",
                f"媒体文件：{review.get('media_file') or ''}",
                f"音频文件：{review.get('audio_file') or ''}",
                f"媒体URL：{review.get('media_url') or ''}",
                f"口播状态：{review.get('speech_status') or ''}",
                f"口播错误：{review.get('speech_error') or ''}",
                f"作品描述：{review.get('video_description') or ''}",
                f"标签：{'、'.join(tags)}",
                "",
                "口播文案：",
                review.get("speech_transcript") or "",
                "",
                f"扣子/工作流状态：{review.get('work_decision_status') or ''}",
                f"是否继续采集评论：{review.get('work_decision_should_run')}",
                f"判断原因：{review.get('work_decision_reason') or ''}",
            ]
        )

    def _apply_speech_result(self, item: Any, result: SpeechAnalysisResult) -> None:
        item.speech_status = result.status
        item.speech_transcript = result.transcript or None
        item.speech_error = result.error or None
        item.video_description = result.description or None
        item.video_tags = list(result.tags or [])
        if result.duration is not None and not getattr(item, "duration_sec", None):
            try:
                item.duration_sec = int(float(result.duration))
            except Exception:
                pass
        if result.title:
            item.video_title = result.title
        if result.title and not getattr(item, "caption", None):
            item.caption = result.title
        field_source = getattr(item, "field_source", None) or {}
        field_source["speech"] = "playwright_media_whisper" if result.status == "SUCCESS" else "failed"
        if result.description:
            field_source["video_description"] = "page_meta"
        if result.tags:
            field_source["video_tags"] = "page_meta"
        item.field_source = field_source

    def _run_work_decision(self, item: Any, fail_strategy: str = 'SKIP', workflow_id: str = '') -> Dict[str, Any]:
        fail_should_run = str(fail_strategy or '').upper() == 'RUN'
        if not str(workflow_id or '').strip():
            item.work_decision_status = "CONFIG_MISSING"
            item.work_decision_should_run = False
            item.work_decision_reason = "请在机器人配置中明确填写作品判定 workflowId，或关闭作品判定"
            return {"ok": False, "should_collect_comments": False, "reason": item.work_decision_reason}
        if not self.core_client or not self.robot_id:
            item.work_decision_status = "FAILED_CONTINUE" if fail_should_run else "FAILED_SKIP"
            item.work_decision_should_run = fail_should_run
            item.work_decision_reason = "work decision client unavailable; continue comment capture" if fail_should_run else "work decision client unavailable; skip comment capture"
            return {
                "ok": False,
                "should_collect_comments": fail_should_run,
                "reason": item.work_decision_reason,
            }
        try:
            response = self.core_client.run_intercept_work_decision(
                self.robot_id,
                video=self._build_work_decision_video(item),
                workflow_id=str(workflow_id or '').strip() or None,
            )
        except Exception as exc:
            item.work_decision_status = "FAILED_CONTINUE" if fail_should_run else "FAILED_SKIP"
            item.work_decision_should_run = fail_should_run
            item.work_decision_workflow_id = str(workflow_id or '').strip() or None
            item.work_decision_reason = (
                f"work decision request failed; continue comment capture: {exc}"
                if fail_should_run else f"work decision request failed; skip comment capture: {exc}"
            )
            return {
                "ok": False,
                "should_collect_comments": fail_should_run,
                "reason": item.work_decision_reason,
                "error": str(exc),
            }

        ok = response.get("ok") is not False if isinstance(response, dict) else False
        configured_workflow_id = str(workflow_id or '').strip()
        response_workflow_id = str(response.get("workflowId") or response.get("workflow_id") or "") if isinstance(response, dict) else ""
        raw_should_run = None
        if isinstance(response, dict):
            for key in ("shouldRun", "should_run", "shouldCollectComments", "should_collect_comments"):
                if key in response:
                    raw_should_run = response.get(key)
                    break
        should_run = self._parse_optional_bool(raw_should_run)
        reason = str(response.get("reason") or response.get("errMsg") or response.get("message") or "") if isinstance(response, dict) else ""
        item.work_decision_workflow_id = response_workflow_id or configured_workflow_id or None
        if not ok:
            item.work_decision_status = "FAILED_CONTINUE" if fail_should_run else "FAILED_SKIP"
            item.work_decision_should_run = fail_should_run
            item.work_decision_reason = reason or ("work decision failed; continue comment capture" if fail_should_run else "work decision failed; skip comment capture")
            return {**(response if isinstance(response, dict) else {}), "should_collect_comments": fail_should_run}
        if should_run is None:
            item.work_decision_status = "FAILED_CONTINUE" if fail_should_run else "FAILED_SKIP"
            item.work_decision_should_run = fail_should_run
            item.work_decision_reason = reason or (
                "work decision response missing shouldRun; continue comment capture"
                if fail_should_run else "work decision response missing shouldRun; skip comment capture"
            )
            return {**response, "should_collect_comments": fail_should_run}
        if should_run is not True:
            item.work_decision_status = "SKIPPED"
            item.work_decision_should_run = False
            item.work_decision_reason = reason or "work decision did not return shouldRun=true"
            return {**response, "should_collect_comments": False}
        item.work_decision_status = "SHOULD_RUN"
        item.work_decision_should_run = True
        item.work_decision_reason = reason or "work decision allowed comment capture"
        return {**response, "should_collect_comments": True}

    def _build_work_decision_video(self, item: Any) -> Dict[str, Any]:
        return {
            "vid": getattr(item, "platform_content_id", "") or "",
            "url": getattr(item, "source_content_url", "") or "",
            "title": getattr(item, "caption", "") or "",
            "desc": getattr(item, "video_description", "") or "",
            "script": getattr(item, "speech_transcript", "") or "",
            "tags": getattr(item, "video_tags", []) or [],
        }

    def _append_operation_log(
        self,
        *,
        account_debug_dir: Path,
        homepage_url: str,
        homepage_label: str | None = None,
        item: Any,
        index: int,
        total: int,
        comment_count: int,
        skipped: bool,
    ) -> None:
        """Append a concise per-work operation summary for Excel / txt review.

        One record is written for every work that actually reached the pre-comment
        processing stage.  The payload intentionally excludes concrete comments;
        comment_count is enough for operational review.
        """
        try:
            log_dir = account_debug_dir.parent / "operation_log"
            log_dir.mkdir(parents=True, exist_ok=True)
            payload = self._build_operation_log_payload(
                homepage_url=homepage_url,
                homepage_label=homepage_label,
                item=item,
                index=index,
                total=total,
                comment_count=comment_count,
                skipped=skipped,
            )
            # Internal routing metadata is kept only in JSONL so the GUI can export
            # the selected robot's own records when multiple robots finish out of order.
            # CSV/TXT exports intentionally keep the original user-facing columns.
            payload["__robot_id"] = self.robot_id or ""
            payload["__platform"] = self.platform or ""
            payload["__account_alias_key"] = account_debug_dir.parent.parent.name if account_debug_dir.parent.parent else ""
            payload["__run_key"] = account_debug_dir.parent.name if account_debug_dir.parent else ""
            jsonl_path = log_dir / "works_log.jsonl"
            txt_path = log_dir / "works_log.txt"
            csv_path = log_dir / "works_log.csv"
            with jsonl_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(payload, ensure_ascii=False) + "\n")
            with txt_path.open("a", encoding="utf-8") as f:
                f.write(self._format_operation_log_text(payload) + "\n\n")
            fieldnames = list(self._operation_log_export_fields())
            write_header = not csv_path.exists()
            with csv_path.open("a", encoding="utf-8-sig", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
                if write_header:
                    writer.writeheader()
                writer.writerow(payload)
            print(f"[OPERATION_LOG] 总日志已更新：{csv_path}", flush=True)
        except Exception as exc:
            print(f"[OPERATION_LOG] WARN 总日志写入失败：{exc}", flush=True)

    @staticmethod
    def _operation_log_export_fields() -> Tuple[str, ...]:
        return (
            "操作的作品的用户主页链接",
            "操作的作品的用户昵称",
            "操作的作品的用户ID",
            "操作的作品链接",
            "操作的作品的标题",
            "操作的作品的描述",
            "操作的作品的标签",
            "操作的作品的口播文案",
            "是否需要继续的判断结果",
            "判断结果的原因",
        )

    def _build_operation_log_payload(
        self,
        *,
        homepage_url: str,
        homepage_label: str | None = None,
        item: Any,
        index: int,
        total: int,
        comment_count: int,
        skipped: bool,
    ) -> Dict[str, Any]:
        title_text = getattr(item, "video_title", None) or getattr(item, "caption", None) or ""
        description_text = getattr(item, "video_description", None) or ""
        title_clean, title_tags = self._split_text_and_tags(title_text)
        description_clean, desc_tags = self._split_text_and_tags(description_text)
        tags = list(getattr(item, "video_tags", []) or []) + title_tags + desc_tags
        tags = self._dedupe_text_list(tags)
        user_id = (
            getattr(item, "author_user_id", None)
            or self._extract_user_id_from_homepage(homepage_url)
            or ""
        )
        user_nickname = getattr(item, "author_nickname", None) or homepage_label or ""
        should_run = getattr(item, "work_decision_should_run", None)
        if should_run is True:
            should_run_text = "是"
        elif should_run is False:
            should_run_text = "否"
        else:
            should_run_text = "未判定"
        return {
            "操作的作品的用户主页链接": homepage_url or "",
            "操作的作品的用户昵称": user_nickname,
            "操作的作品的用户ID": user_id,
            "操作的作品链接": getattr(item, "source_content_url", None) or "",
            "操作的作品的标题": title_clean or str(title_text or ""),
            "操作的作品的描述": description_clean,
            "操作的作品的标签": "、".join(tags),
            "操作的作品的口播文案": getattr(item, "speech_transcript", None) or "",
            "是否需要继续的判断结果": should_run_text,
            "判断结果的原因": getattr(item, "work_decision_reason", None) or "",
        }

    @staticmethod
    def _format_operation_log_text(payload: Dict[str, Any]) -> str:
        lines: List[str] = []
        for key in AccountSyncService._operation_log_export_fields():
            lines.append(f"{key}：{payload.get(key, '')}")
        return "\n".join(lines)

    @staticmethod
    def _split_text_and_tags(text: Any) -> Tuple[str, List[str]]:
        raw = str(text or "").strip()
        if not raw:
            return "", []
        tags = [m.group(1).strip() for m in re.finditer(r"#([^#\s]+)", raw) if m.group(1).strip()]
        cleaned = re.sub(r"#([^#\s]+)", " ", raw)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" ，,。;；")
        return cleaned, tags

    @staticmethod
    def _dedupe_text_list(values: List[Any]) -> List[str]:
        result: List[str] = []
        seen: set[str] = set()
        for value in values:
            text = str(value or "").strip().lstrip("#").strip()
            if not text or text in seen:
                continue
            seen.add(text)
            result.append(text)
        return result

    @staticmethod
    def _extract_user_id_from_homepage(homepage_url: str) -> str:
        text = str(homepage_url or "")
        for pattern in (r"[?&](?:sec_uid|sec_user_id|sec_userid)=([^&]+)", r"/user/([^/?#]+)"):
            m = re.search(pattern, text)
            if m:
                return m.group(1).strip()
        return ""

    def _apply_homepage_identity(self, item: Any, *, homepage_url: str, homepage_label: str | None = None) -> None:
        if homepage_label and not getattr(item, "author_nickname", None):
            try:
                item.author_nickname = homepage_label
            except Exception:
                pass
        if not getattr(item, "author_user_id", None):
            user_id = self._extract_user_id_from_homepage(homepage_url)
            if user_id:
                try:
                    item.author_user_id = user_id
                except Exception:
                    pass


    def _build_item_summary(
        self,
        item: Any,
        index: int,
        comment_count: int,
        pages_fetched: int,
        cooldown_sec: float,
        comments_summary_path: str = "",
    ) -> Dict[str, object]:
        return {
            "index": index,
            "platform_content_id": getattr(item, "platform_content_id", None),
            "source_content_url": getattr(item, "source_content_url", None),
            "comment_count": comment_count,
            "comments_summary_path": comments_summary_path,
            "pages_fetched": pages_fetched,
            "cooldown_after_post_sec": cooldown_sec,
            "speech_status": getattr(item, "speech_status", None),
            "speech_error": getattr(item, "speech_error", None),
            "speech_transcript_chars": len(getattr(item, "speech_transcript", None) or ""),
            "video_description": getattr(item, "video_description", None),
            "video_tags": getattr(item, "video_tags", []) or [],
            "work_decision_status": getattr(item, "work_decision_status", None),
            "work_decision_should_run": getattr(item, "work_decision_should_run", None),
            "work_decision_reason": getattr(item, "work_decision_reason", None),
            "work_decision_workflow_id": getattr(item, "work_decision_workflow_id", None),
        }

    def _write_json(self, path: Path, payload: Any) -> None:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass

    def _parse_optional_bool(self, value: Any) -> bool | None:
        if isinstance(value, bool):
            return value
        if value is None or value == "":
            return None
        if isinstance(value, (int, float)):
            return bool(value)
        text = str(value).strip().lower()
        if text in {"true", "1", "yes", "y", "run", "continue", "继续", "是"}:
            return True
        if text in {"false", "0", "no", "n", "skip", "stop", "跳过", "否"}:
            return False
        return None

    def _resolve_comment_runtime_seconds(self, remaining_seconds: int | None, comment_fetch_max_seconds: int | None) -> int | None:
        limits = [int(value) for value in [remaining_seconds, comment_fetch_max_seconds] if value and int(value) > 0]
        return min(limits) if limits else None

    def _resolve_post_cooldown(
        self,
        comment_count: int,
        comment_pages_fetched: int,
        min_sec: float | None,
        max_sec: float | None,
    ) -> float:
        if min_sec is not None or max_sec is not None:
            lower = max(float(min_sec or 0), 0.0)
            upper = max(float(max_sec if max_sec is not None else lower), lower)
            if upper <= 0:
                return 0.0
            return round(random.uniform(lower, upper), 2)
        return self.pacing.between_post_cooldown(comment_count=comment_count, comment_pages_fetched=comment_pages_fetched)

    def _resolve_homepage_posts_fetch_limit(self, max_posts: int, lookback_days: int | None) -> int:
        """主页模式下，先扩大作品列表采样，再按发布时间过滤和最终上限处理。

        抖音主页前几个作品可能是置顶旧作品。如果直接把 max_posts 传给作品列表采集，
        时间过滤可能把这些置顶旧作品全部过滤掉，导致后续完全不进入评论采集阶段。
        """
        if not lookback_days or lookback_days <= 0:
            return max_posts
        if max_posts <= 0:
            return 0
        return min(max(max_posts * 10, max_posts + 20, 50), 300)

    def _load_json(self, path: Path):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return {}


    def _parse_duration_seconds_for_filter(self, item: Any):
        raw_values = [getattr(item, "duration_sec", None), getattr(item, "duration_raw", None)]
        for raw in raw_values:
            if raw in (None, ""):
                continue
            try:
                numeric = float(raw)
                if numeric < 0:
                    continue
                # 抖音 web_post_api 常见 duration 为毫秒；当前 posts_api 已尽量转为秒。
                if numeric > 36000:
                    numeric = numeric / 1000.0
                return int(round(numeric)), raw, True
            except Exception:
                continue
        if any(raw not in (None, "") for raw in raw_values):
            return None, next((raw for raw in raw_values if raw not in (None, "")), None), False
        return None, None, None

    def _filter_items_by_duration_with_debug(self, items, max_duration_seconds: int):
        limit = max(int(max_duration_seconds or 0), 0)
        filtered = []
        debug = {
            "max_duration_seconds": limit,
            "kept_missing_duration": 0,
            "kept_parse_failed": 0,
            "kept_in_range": 0,
            "dropped_over_duration": 0,
            "samples": [],
        }
        if limit <= 0:
            return list(items), debug
        for item in items:
            duration_sec, raw_duration, parse_state = self._parse_duration_seconds_for_filter(item)
            sample = {
                "id": getattr(item, "platform_content_id", None),
                "url": getattr(item, "source_content_url", None),
                "caption": (getattr(item, "caption", None) or "")[:80],
                "duration_raw": raw_duration,
                "duration_sec": duration_sec,
                "max_duration_seconds": limit,
                "decision": None,
                "reason": None,
            }
            if duration_sec is None and parse_state is None:
                filtered.append(item)
                debug["kept_missing_duration"] += 1
                sample["decision"] = "keep"
                sample["reason"] = "missing_duration"
            elif duration_sec is None:
                filtered.append(item)
                debug["kept_parse_failed"] += 1
                sample["decision"] = "keep"
                sample["reason"] = "duration_parse_failed"
            elif duration_sec <= limit:
                filtered.append(item)
                debug["kept_in_range"] += 1
                sample["decision"] = "keep"
                sample["reason"] = "duration_in_range"
                try:
                    item.duration_sec = duration_sec
                    item.duration_raw = str(raw_duration if raw_duration is not None else duration_sec)
                    field_source = getattr(item, "field_source", None) or {}
                    field_source["duration_filter"] = "duration_sec"
                    setattr(item, "field_source", field_source)
                except Exception:
                    pass
            else:
                debug["dropped_over_duration"] += 1
                sample["decision"] = "drop"
                sample["reason"] = "duration_over_limit"
            if len(debug["samples"]) < 30:
                debug["samples"].append(sample)
        return filtered, debug

    def _filter_items_by_lookback(self, items, lookback_days: int):
        filtered, _debug = self._filter_items_by_lookback_with_debug(items, lookback_days)
        return filtered

    def _parse_iso_datetime_for_filter(self, value: Any):
        if value in (None, ""):
            return None
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.astimezone()
            return dt.astimezone()
        except Exception:
            return None

    def _build_time_candidates_for_filter(self, item):
        candidates = []
        publish_iso = getattr(item, "publish_time_iso", None)
        publish_dt = self._parse_iso_datetime_for_filter(publish_iso)
        if publish_iso:
            candidates.append(
                {
                    "source": "publish_time_iso",
                    "iso": publish_iso,
                    "dt": publish_dt,
                    "parse_ok": publish_dt is not None,
                }
            )

        item_id = getattr(item, "platform_content_id", None)
        aweme_id_iso = aweme_id_to_iso(item_id)
        aweme_id_dt = self._parse_iso_datetime_for_filter(aweme_id_iso)
        if aweme_id_iso:
            candidates.append(
                {
                    "source": "aweme_id_timestamp",
                    "iso": aweme_id_iso,
                    "dt": aweme_id_dt,
                    "parse_ok": aweme_id_dt is not None,
                }
            )
        return candidates, aweme_id_iso

    def _filter_items_by_lookback_with_debug(self, items, lookback_days: int):
        now = datetime.now().astimezone()
        cutoff = now - timedelta(days=max(int(lookback_days), 1))
        future_guard = now + timedelta(days=3)
        filtered = []
        debug = {
            "now": now.isoformat(),
            "cutoff": cutoff.isoformat(),
            "lookback_days": max(int(lookback_days), 1),
            "kept_missing_time": 0,
            "kept_parse_failed": 0,
            "kept_in_range": 0,
            "kept_corrected_by_aweme_id": 0,
            "kept_by_any_time_candidate": 0,
            "dropped_expired": 0,
            "dropped_future_invalid": 0,
            "time_source_mismatch": 0,
            "samples": [],
        }
        for item in items:
            item_id = getattr(item, "platform_content_id", None)
            publish_iso = getattr(item, "publish_time_iso", None)
            candidates, aweme_id_iso = self._build_time_candidates_for_filter(item)
            parsed_candidates = [candidate for candidate in candidates if candidate.get("dt") is not None]
            valid_candidates = [
                candidate for candidate in parsed_candidates
                if candidate["dt"] <= future_guard and candidate["dt"].year >= 2016
            ]
            in_range_candidates = [candidate for candidate in valid_candidates if candidate["dt"] >= cutoff]
            expired_candidates = [candidate for candidate in valid_candidates if candidate["dt"] < cutoff]
            candidate_for_log = in_range_candidates[0] if in_range_candidates else (valid_candidates[0] if valid_candidates else None)

            if len(valid_candidates) >= 2:
                try:
                    max_delta_days = max(candidate["dt"] for candidate in valid_candidates) - min(candidate["dt"] for candidate in valid_candidates)
                    if abs(max_delta_days) > timedelta(days=1):
                        debug["time_source_mismatch"] += 1
                except Exception:
                    pass

            sample_candidates = []
            for candidate in candidates[:4]:
                dt = candidate.get("dt")
                sample_candidates.append(
                    {
                        "source": candidate.get("source"),
                        "iso": candidate.get("iso"),
                        "parse_ok": candidate.get("parse_ok"),
                        "age_days": round(max((now - dt).total_seconds(), 0) / 86400, 2) if dt else None,
                        "in_range": bool(dt and dt <= future_guard and dt >= cutoff),
                    }
                )

            sample = {
                "id": item_id,
                "url": getattr(item, "source_content_url", None),
                "caption": (getattr(item, "caption", None) or "")[:80],
                "raw": getattr(item, "publish_time_raw", None),
                "iso": publish_iso,
                "aweme_id_iso": aweme_id_iso,
                "effective_iso": candidate_for_log.get("iso") if candidate_for_log else None,
                "effective_source": candidate_for_log.get("source") if candidate_for_log else None,
                "age_days": round(max((now - candidate_for_log["dt"]).total_seconds(), 0) / 86400, 2) if candidate_for_log else None,
                "cutoff": cutoff.isoformat(),
                "candidates": sample_candidates,
                "decision": None,
                "reason": None,
            }

            if in_range_candidates:
                chosen = in_range_candidates[0]
                filtered.append(item)
                debug["kept_in_range"] += 1
                if chosen.get("source") == "aweme_id_timestamp":
                    debug["kept_corrected_by_aweme_id"] += 1
                if len(valid_candidates) > 1:
                    debug["kept_by_any_time_candidate"] += 1
                setattr(item, "publish_time_iso", chosen.get("iso"))
                field_source = getattr(item, "field_source", None) or {}
                field_source["publish_time_filter"] = chosen.get("source")
                setattr(item, "field_source", field_source)
                sample["effective_iso"] = chosen.get("iso")
                sample["effective_source"] = chosen.get("source")
                sample["age_days"] = round(max((now - chosen["dt"]).total_seconds(), 0) / 86400, 2)
                sample["decision"] = "keep"
                sample["reason"] = "one_time_candidate_in_lookback_range"
            elif valid_candidates and expired_candidates and len(expired_candidates) == len(valid_candidates):
                debug["dropped_expired"] += 1
                sample["decision"] = "drop"
                sample["reason"] = "all_valid_time_candidates_expired"
            elif parsed_candidates and not valid_candidates:
                # 只有明显异常的未来时间/过早时间时，不拿它当符合条件。
                debug["dropped_future_invalid"] += 1
                sample["decision"] = "drop"
                sample["reason"] = "all_time_candidates_invalid"
            elif candidates:
                # 有时间字段但都解析失败，沿用原有容错：保留，避免平台字段格式变化导致误过滤。
                filtered.append(item)
                debug["kept_parse_failed"] += 1
                sample["decision"] = "keep"
                sample["reason"] = "time_candidates_parse_failed"
            else:
                # 完全没有发布时间，沿用原有容错：保留，同时日志明确说明原因。
                filtered.append(item)
                debug["kept_missing_time"] += 1
                sample["decision"] = "keep"
                sample["reason"] = "missing_publish_time"

            if len(debug["samples"]) < 30:
                debug["samples"].append(sample)
        return filtered, debug
