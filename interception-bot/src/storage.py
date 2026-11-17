from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import shutil
import time
from pathlib import Path
from typing import Iterable, List

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from .models import RunResult, CommentRecord


def safe_path_key(value: object, fallback: str = "robot") -> str:
    raw = str(value or "").strip() or fallback
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", raw).strip("_")[:56] or fallback
    digest = hashlib.sha1(raw.encode("utf-8", errors="ignore")).hexdigest()[:10]
    return f"{safe}_{digest}" if digest and digest not in safe else safe


def readable_path_key(value: object, fallback: str = "item") -> str:
    raw = str(value or "").strip() or fallback
    # Windows/macOS/Linux common invalid path characters. Keep Chinese and most unicode text readable.
    safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", raw)
    safe = re.sub(r"\s+", " ", safe).strip(" ._")
    return safe[:80] or fallback


HEADER_FILL = PatternFill("solid", fgColor="1F4E78")
HEADER_FONT = Font(color="FFFFFF", bold=True)
SUBHEADER_FILL = PatternFill("solid", fgColor="D9EAF7")
SECTION_FONT = Font(bold=True)
THIN_GRAY = Side(style="thin", color="D9D9D9")
SECTION_BORDER = Border(bottom=THIN_GRAY)
WRAP_TOP = Alignment(vertical="top", wrap_text=True)


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _env_bool(name: str, fallback: bool) -> bool:
    value = os.getenv(name)
    if value is None or value == "":
        return fallback
    return str(value).strip().lower() in {"1", "true", "yes", "on", "y", "是", "开启"}


def _env_int(name: str, fallback: int, minimum: int | None = None) -> int:
    try:
        value = os.getenv(name)
        result = int(value) if value not in (None, "") else fallback
    except Exception:
        result = fallback
    if minimum is not None:
        result = max(result, minimum)
    return result


def _safe_stat_size(path: Path) -> int:
    try:
        return int(path.stat().st_size)
    except Exception:
        return 0


def _format_mb(size_bytes: int) -> float:
    return round(float(size_bytes or 0) / 1024 / 1024, 2)


def cleanup_speech_debug_dir(debug_dir: Path, keep_media: bool | None = None) -> dict:
    """Remove heavy temporary speech artifacts while keeping review/transcript metadata.

    Default is storage-safe: media/audio/browser-profile files are deleted after the
    speech review files have been written.  Set ACS_KEEP_SPEECH_MEDIA=1 when you need
    to retain downloaded mp4/mp3 files for a debugging run.
    """
    debug_dir = Path(debug_dir)
    keep = _env_bool("ACS_KEEP_SPEECH_MEDIA", False) if keep_media is None else bool(keep_media)
    result = {
        "enabled": not keep,
        "debug_dir": str(debug_dir),
        "removed_files": [],
        "removed_dirs": [],
        "removed_bytes": 0,
        "removed_mb": 0.0,
        "kept_reason": "ACS_KEEP_SPEECH_MEDIA=1" if keep else "",
    }
    if keep or not debug_dir.exists():
        return result

    patterns = [
        "source_playwright*.mp4",
        "source_playwright*.m4a",
        "source_playwright*.webm",
        "source_playwright*.mov",
        "source_playwright*.flv",
        "audio*.mp3",
        "audio*.wav",
        "audio*.m4a",
        "audio*.aac",
        "*.part",
        "*.download",
        "*.tmp",
    ]
    protected_names = {
        "result.json",
        "metadata.json",
        "transcript.txt",
        "speech_logs.txt",
        "speech_review.json",
        "speech_review.txt",
        "work_decision.json",
        "cleanup_info.json",
    }
    removed_bytes = 0
    removed_files: list[str] = []
    for pattern in patterns:
        for path in debug_dir.glob(pattern):
            if not path.is_file() or path.name in protected_names:
                continue
            size = _safe_stat_size(path)
            try:
                path.unlink()
                removed_bytes += size
                removed_files.append(str(path))
            except Exception:
                pass

    removed_dirs: list[str] = []
    if not _env_bool("ACS_KEEP_SPEECH_PROFILE", False):
        for dirname in ("_speech_playwright_profile", "profile", "tmp_profile"):
            path = debug_dir / dirname
            if path.exists() and path.is_dir():
                dir_size = _dir_size(path)
                try:
                    shutil.rmtree(path, ignore_errors=True)
                    removed_bytes += dir_size
                    removed_dirs.append(str(path))
                except Exception:
                    pass

    result["removed_files"] = removed_files
    result["removed_dirs"] = removed_dirs
    result["removed_bytes"] = removed_bytes
    result["removed_mb"] = _format_mb(removed_bytes)
    try:
        (debug_dir / "cleanup_info.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass
    return result


def cleanup_output_retention(
    base_dir: Path,
    current_run_id: str | None = None,
    protected_run_ids: Iterable[str] | None = None,
) -> dict:
    """Prune old output run directories to prevent local disk growth.

    Any incomplete intercept run manifest in ``state/intercept_runs`` protects its
    matching output run directory. This prevents scheduled cleanup from deleting
    data that still needs recovery or synchronization. Defaults:
    ``ACS_OUTPUT_RETENTION_DAYS=7``, ``ACS_OUTPUT_RETENTION_LATEST=20``,
    ``ACS_OUTPUT_MAX_TOTAL_MB=2048``, ``ACS_CLEANUP_OUTPUT_ENABLED=0``.
    """
    base_dir = Path(base_dir)
    enabled = _env_bool("ACS_CLEANUP_OUTPUT_ENABLED", True)
    keep_days = _env_int("ACS_OUTPUT_RETENTION_DAYS", 7, 0)
    keep_latest = _env_int("ACS_OUTPUT_RETENTION_LATEST", 20, 0)
    max_total_mb = _env_int("ACS_OUTPUT_MAX_TOTAL_MB", 2048, 0)
    result = {
        "enabled": enabled,
        "base_dir": str(base_dir),
        "keep_days": keep_days,
        "keep_latest": keep_latest,
        "max_total_mb": max_total_mb,
        "current_run_id": current_run_id or "",
        "protected_run_ids": [],
        "removed_run_dirs": [],
        "removed_bytes": 0,
        "removed_mb": 0.0,
        "remaining_total_mb": 0.0,
    }
    if not enabled or not base_dir.exists():
        return result

    run_dirs = _find_output_run_dirs(base_dir)
    if not run_dirs:
        return result

    run_dirs.sort(key=lambda item: item[1], reverse=True)
    protected_ids = {str(value).strip() for value in (protected_run_ids or []) if str(value).strip()}
    if current_run_id:
        protected_ids.add(str(current_run_id))
    protected_ids.update(_recoverable_intercept_run_ids(base_dir))
    result["protected_run_ids"] = sorted(protected_ids)
    protected: set[Path] = {path for path, _mtime, _size in run_dirs if path.name in protected_ids}
    protected.update(path for path, _mtime, _size in run_dirs[:keep_latest])

    now = time.time()
    cutoff = now - keep_days * 86400 if keep_days > 0 else None
    removed_bytes = 0
    removed_dirs: list[str] = []

    def remove_dir(path: Path, size: int) -> None:
        nonlocal removed_bytes
        try:
            shutil.rmtree(path, ignore_errors=True)
            removed_bytes += size
            removed_dirs.append(str(path))
        except Exception:
            pass

    if cutoff is not None:
        for path, mtime, size in list(run_dirs):
            if path in protected or not path.exists():
                continue
            if mtime < cutoff:
                remove_dir(path, size)

    # Recompute after age pruning and enforce a soft global cap.
    remaining = _find_output_run_dirs(base_dir)
    remaining.sort(key=lambda item: item[1])  # oldest first
    total_bytes = sum(size for _path, _mtime, size in remaining)
    max_total_bytes = max_total_mb * 1024 * 1024 if max_total_mb > 0 else 0
    if max_total_bytes > 0 and total_bytes > max_total_bytes:
        for path, _mtime, size in remaining:
            if total_bytes <= max_total_bytes:
                break
            if path in protected or not path.exists():
                continue
            remove_dir(path, size)
            total_bytes -= size

    final_total = sum(size for _path, _mtime, size in _find_output_run_dirs(base_dir))
    result["removed_run_dirs"] = removed_dirs
    result["removed_bytes"] = removed_bytes
    result["removed_mb"] = _format_mb(removed_bytes)
    result["remaining_total_mb"] = _format_mb(final_total)
    return result



def _recoverable_intercept_run_ids(output_base_dir: Path) -> set[str]:
    """Return run IDs whose durable intercept manifest is not terminal.

    Kept local and defensive so cleanup remains available even if a malformed
    recovery file is left behind after a forced process termination.
    """
    state_root = Path(output_base_dir).parent / "state" / "intercept_runs"
    protected: set[str] = set()
    if not state_root.exists():
        return protected
    for path in state_root.glob("*/*/run_manifest.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(payload, dict):
            continue
        status = str(payload.get("status") or "").upper()
        if status in {"RUNNING", "STOPPED", "ERROR", "RECOVERABLE"}:
            run_id = str(payload.get("runId") or path.parent.name).strip()
            if run_id:
                protected.add(run_id)
    return protected

def _find_output_run_dirs(base_dir: Path) -> list[tuple[Path, float, int]]:
    result: list[tuple[Path, float, int]] = []
    pattern = re.compile(r"^\d{8}_\d{6}$")
    for path in base_dir.glob("*/*/*"):
        if not path.is_dir() or not pattern.match(path.name):
            continue
        try:
            mtime = path.stat().st_mtime
        except Exception:
            mtime = 0.0
        result.append((path, mtime, _dir_size(path)))
    return result


def _dir_size(path: Path) -> int:
    total = 0
    if not path.exists():
        return 0
    for child in path.rglob("*"):
        if child.is_file():
            total += _safe_stat_size(child)
    return total


def output_platform_dir(base_dir: Path, platform: object) -> Path:
    return base_dir / readable_path_key(platform or "platform", fallback="platform")


def output_account_dir(base_dir: Path, platform: object, account_alias: object) -> Path:
    return output_platform_dir(base_dir, platform) / readable_path_key(account_alias or "account", fallback="account")


def output_run_dir(base_dir: Path, platform: object, account_alias: object, run_id: object) -> Path:
    return output_account_dir(base_dir, platform, account_alias) / readable_path_key(run_id or "run", fallback="run")


def output_section_dir(base_dir: Path, platform: object, account_alias: object, run_id: object, section: str) -> Path:
    return output_run_dir(base_dir, platform, account_alias, run_id) / readable_path_key(section or "section", fallback="section")


def flatten_comments(item_url: str, comments: Iterable[CommentRecord], parent_comment_id: str | None = None):
    for c in comments:
        yield {
            "comment_id": c.comment_id,
            "parent_comment_id": c.parent_comment_id or parent_comment_id,
            "user_id": c.user_id,
            "nickname": c.nickname,
            "comment_text": c.comment_text,
            "comment_time_raw": c.comment_time_raw,
            "comment_time_iso": c.comment_time_iso,
            "visible_region": c.visible_region,
            "source_account_url": c.source_account_url,
            "source_content_url": c.source_content_url or item_url,
            "platform": c.platform,
            "comment_type": c.comment_type,
            "has_media": c.has_media,
            "media_urls": "|".join(c.media_urls or []),
        }
        if c.replies:
            yield from flatten_comments(item_url, c.replies, c.comment_id)


def flatten_posts(result: RunResult):
    for item in result.items:
        yield {
            "platform": item.platform,
            "source_account_url": item.source_account_url,
            "source_content_url": item.source_content_url,
            "platform_content_id": item.platform_content_id,
            "caption": item.caption,
            "publish_time_raw": item.publish_time_raw,
            "publish_time_iso": item.publish_time_iso,
            "duration_raw": item.duration_raw,
            "duration_sec": item.duration_sec,
            "comment_count": len(list(flatten_comments(item.source_content_url, item.comments))),
            "field_source": json.dumps(item.field_source or {}, ensure_ascii=False),
        }


class ResultStore:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        ensure_dir(base_dir)

    def save(self, result: RunResult) -> tuple[Path, Path, Path]:
        result_dir = output_run_dir(self.base_dir, result.platform, result.account_alias, result.run_id)
        ensure_dir(result_dir)
        json_path = result_dir / "result.json"
        csv_path = result_dir / "comments.csv"
        xlsx_path = result_dir / "result.xlsx"

        with json_path.open("w", encoding="utf-8") as f:
            json.dump(result.to_dict(), f, ensure_ascii=False, indent=2)

        comment_rows: List[dict] = []
        for item in result.items:
            comment_rows.extend(list(flatten_comments(item.source_content_url, item.comments)))

        fieldnames = [
            "platform",
            "source_account_url",
            "source_content_url",
            "comment_id",
            "parent_comment_id",
            "user_id",
            "nickname",
            "comment_text",
            "comment_time_raw",
            "comment_time_iso",
            "visible_region",
            "comment_type",
            "has_media",
            "media_urls",
        ]
        with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for row in comment_rows:
                writer.writerow(row)

        self._save_excel(result=result, xlsx_path=xlsx_path, comment_rows=comment_rows)
        return json_path, csv_path, xlsx_path

    def _save_excel(self, result: RunResult, xlsx_path: Path, comment_rows: List[dict]) -> None:
        wb = Workbook()
        ws_summary = wb.active
        ws_summary.title = "run_summary"
        ws_posts = wb.create_sheet("posts")
        ws_comments = wb.create_sheet("comments")

        self._write_summary_sheet(ws_summary, result, comment_rows)
        self._write_table_sheet(
            ws_posts,
            rows=list(flatten_posts(result)),
            headers=[
                "platform",
                "source_account_url",
                "source_content_url",
                "platform_content_id",
                "caption",
                "publish_time_raw",
                "publish_time_iso",
                "duration_raw",
                "duration_sec",
                "comment_count",
                "field_source",
            ],
            title="作品明细",
        )
        self._write_table_sheet(
            ws_comments,
            rows=comment_rows,
            headers=[
                "platform",
                "source_account_url",
                "source_content_url",
                "comment_id",
                "parent_comment_id",
                "user_id",
                "nickname",
                "comment_text",
                "comment_time_raw",
                "comment_time_iso",
                "visible_region",
                "comment_type",
                "has_media",
                "media_urls",
            ],
            title="评论明细",
        )

        for ws in [ws_summary, ws_posts, ws_comments]:
            ws.freeze_panes = "A2" if ws.title != "run_summary" else None
            self._autofit_columns(ws)

        wb.save(xlsx_path)

    def _write_summary_sheet(self, ws, result: RunResult, comment_rows: List[dict]) -> None:
        ws["A1"] = "采集汇总"
        ws["A1"].fill = HEADER_FILL
        ws["A1"].font = HEADER_FONT
        ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
        ws.merge_cells("A1:B1")

        pairs = [
            ("run_id", result.run_id),
            ("platform", result.platform),
            ("account_alias", result.account_alias),
            ("homepage_url", result.homepage_url),
            ("generated_at", result.generated_at),
            ("posts_count", len(result.items)),
            ("comments_count", len(comment_rows)),
        ]
        row = 3
        for key, value in pairs:
            ws.cell(row=row, column=1, value=key)
            ws.cell(row=row, column=2, value=value)
            ws.cell(row=row, column=1).font = SECTION_FONT
            ws.cell(row=row, column=1).fill = SUBHEADER_FILL
            ws.cell(row=row, column=1).border = SECTION_BORDER
            ws.cell(row=row, column=2).border = SECTION_BORDER
            ws.cell(row=row, column=1).alignment = WRAP_TOP
            ws.cell(row=row, column=2).alignment = WRAP_TOP
            row += 1
        ws.column_dimensions["A"].width = 20
        ws.column_dimensions["B"].width = 80

    def _write_table_sheet(self, ws, rows: List[dict], headers: List[str], title: str) -> None:
        ws["A1"] = title
        ws["A1"].fill = HEADER_FILL
        ws["A1"].font = HEADER_FONT
        ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(headers))

        for col_idx, header in enumerate(headers, start=1):
            cell = ws.cell(row=2, column=col_idx, value=header)
            cell.fill = SUBHEADER_FILL
            cell.font = SECTION_FONT
            cell.alignment = WRAP_TOP
            cell.border = SECTION_BORDER

        for row_idx, row in enumerate(rows, start=3):
            for col_idx, header in enumerate(headers, start=1):
                value = row.get(header)
                cell = ws.cell(row=row_idx, column=col_idx, value=value)
                cell.alignment = WRAP_TOP

    def _autofit_columns(self, ws) -> None:
        max_widths = {}
        for row in ws.iter_rows():
            for cell in row:
                if cell.coordinate in ws.merged_cells:
                    continue
                value = "" if cell.value is None else str(cell.value)
                current = max_widths.get(cell.column, 0)
                max_widths[cell.column] = min(max(current, len(value) + 2), 60)
        for col_idx, width in max_widths.items():
            ws.column_dimensions[get_column_letter(col_idx)].width = max(width, 12)


    def save_nested_json(self, result: RunResult) -> Path:
        result_dir = output_run_dir(self.base_dir, result.platform, result.account_alias, result.run_id)
        ensure_dir(result_dir)
        json_path = result_dir / "result.json"

        payload = {
            "run_id": result.run_id,
            "platform": result.platform,
            "account_alias": result.account_alias,
            "homepage_url": result.homepage_url,
            "generated_at": result.generated_at,
            "items": [self._build_post_payload(item) for item in result.items],
        }

        with json_path.open("w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

        return json_path

    def _build_post_payload(self, item) -> dict:
        return {
            "post": {
                "platform": item.platform,
                "source_account_url": item.source_account_url,
                "source_content_url": item.source_content_url,
                "platform_content_id": item.platform_content_id,
                "caption": item.caption,
                "publish_time_raw": item.publish_time_raw,
                "publish_time_iso": item.publish_time_iso,
                "duration_raw": item.duration_raw,
                "duration_sec": item.duration_sec,
                "speech_transcript": getattr(item, "speech_transcript", None),
                "speech_status": getattr(item, "speech_status", None),
                "speech_error": getattr(item, "speech_error", None),
                "video_description": getattr(item, "video_description", None),
                "video_tags": getattr(item, "video_tags", []) or [],
                "work_decision_status": getattr(item, "work_decision_status", None),
                "work_decision_should_run": getattr(item, "work_decision_should_run", None),
                "work_decision_reason": getattr(item, "work_decision_reason", None),
                "work_decision_workflow_id": getattr(item, "work_decision_workflow_id", None),
                "field_source": item.field_source or {},
                "comments": [self._build_comment_payload(c) for c in (item.comments or [])],
            }
        }

    def _build_comment_payload(self, comment: CommentRecord) -> dict:
        return {
            "comment_id": comment.comment_id,
            "parent_comment_id": comment.parent_comment_id,
            "user_id": comment.user_id,
            "nickname": comment.nickname,
            "comment_text": comment.comment_text,
            "comment_time_raw": comment.comment_time_raw,
            "comment_time_iso": comment.comment_time_iso,
            "visible_region": comment.visible_region,
            "source_account_url": comment.source_account_url,
            "source_content_url": comment.source_content_url,
            "platform": comment.platform,
            "comment_type": comment.comment_type,
            "has_media": comment.has_media,
            "media_urls": comment.media_urls or [],
            "replies": [self._build_comment_payload(reply) for reply in (comment.replies or [])],
        }
