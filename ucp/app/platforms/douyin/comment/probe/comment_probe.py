from __future__ import annotations

import json
import time
from typing import Any


def _short_text(value: Any, limit: int = 90) -> str:
    text = str(value or "").replace("\n", " ").strip()
    text = " ".join(text.split())
    return text[:limit]


def _compact_candidate(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "level": _short_text(item.get("targetLevel") or item.get("level"), 16),
        "author": _short_text(item.get("author"), 40),
        "content": _short_text(item.get("content"), 70),
        "reason": _short_text(item.get("skipReason") or item.get("replyNeedReason"), 48),
    }


def emit_comment_probe_logs(result: dict[str, Any], log) -> None:
    """Emit concise comment-module inspection logs.

    The probe result can be very large. Earlier builds printed full DOM summaries,
    full candidate arrays, editor snapshots, and repeated no-change states every
    scan. This kept useful state visible but made runtime logs hard to read. The
    default output now keeps only:
      1. a count summary when it changes or every 15 seconds;
      2. a compact candidate/skip summary when candidate state changes;
      3. a sparse empty-list warning during initial loading.
    Full diagnostics are still available from editor timeout warnings.
    """
    counts = result.get("counts", {}) or {}
    header = result.get("header", {}) or {}
    work_selector = result.get("workSelector", {}) or {}
    work_drawer = result.get("workDrawer", {}) or {}
    composers = result.get("composers", {}) or {}
    top_comments = result.get("topComments", []) or []
    nested_samples = result.get("nestedSamples", []) or []
    heuristic = result.get("unrepliedHeuristic", []) or []
    reply_candidates = result.get("replyCandidates", []) or []
    reply_skipped = result.get("replySkippedSamples", []) or []

    summary = {
        "work": _short_text(header.get("currentWorkTitle"), 80),
        "filter": _short_text((result.get("commentFilter", {}) or {}).get("selectedText", "") if isinstance(result.get("commentFilter"), dict) else "", 24),
        "top": counts.get("topComments", len(top_comments)),
        "nested": counts.get("nestedVisibleCards", len(nested_samples)),
        "candidates": counts.get("replyCandidates", len(reply_candidates)),
        "skipped": counts.get("replySkipped", len(reply_skipped)),
        "collapsed": counts.get("collapsedReplyThreads", 0),
        "followup": counts.get("followupCandidates", 0),
        "editors": counts.get("replyEditors", len(composers.get("replyEditors", []) or [])),
        "drawer": bool(work_drawer.get("found", False)),
        "selector": bool(work_selector.get("found", False)),
    }

    now_ms = int(time.monotonic() * 1000)
    state = getattr(emit_comment_probe_logs, "_state", None)
    if not isinstance(state, dict):
        state = {}
        setattr(emit_comment_probe_logs, "_state", state)

    state_key = "|".join([
        str(header.get("title", "") or ""),
        str(header.get("currentWorkTitle", "") or ""),
        str(summary.get("filter", "") or ""),
    ])
    bucket = state.get(state_key, {})

    summary_sig = json.dumps(summary, sort_keys=True, ensure_ascii=False)
    summary_changed = summary_sig != bucket.get("summarySig")
    completed_like = bool(reply_skipped) and not reply_candidates and all(str((item or {}).get("skipReason", "") or "") == "already_completed" for item in reply_skipped if isinstance(item, dict))
    summary_interval_ms = 60000 if completed_like else 15000
    if summary_changed or now_ms - int(bucket.get("summaryLastMs", 0) or 0) >= summary_interval_ms:
        log("INFO", f"评论页巡检摘要: {json.dumps(summary, ensure_ascii=False)}")
        bucket["summarySig"] = summary_sig
        bucket["summaryLastMs"] = now_ms

    candidate_payload = {
        "candidateCount": len(reply_candidates),
        "candidates": [_compact_candidate(item) for item in reply_candidates[:3] if isinstance(item, dict)],
        "skipCount": len(reply_skipped),
        "skips": [_compact_candidate(item) for item in reply_skipped[:3] if isinstance(item, dict)],
    }
    candidate_sig = json.dumps(candidate_payload, sort_keys=True, ensure_ascii=False)
    candidate_interval_ms = 60000 if completed_like else 20000
    if candidate_sig != bucket.get("candidateSig") or now_ms - int(bucket.get("candidateLastMs", 0) or 0) >= candidate_interval_ms:
        if reply_candidates or reply_skipped:
            log("INFO", f"评论页候选摘要: {json.dumps(candidate_payload, ensure_ascii=False)}")
        bucket["candidateSig"] = candidate_sig
        bucket["candidateLastMs"] = now_ms

    if not top_comments:
        empty_last = int(bucket.get("emptyTopLastMs", 0) or 0)
        if now_ms - empty_last >= 60000:
            log("INFO", "评论页暂未读取到顶层评论，等待页面稳定后继续巡检")
            bucket["emptyTopLastMs"] = now_ms

    state[state_key] = bucket
