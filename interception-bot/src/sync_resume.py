from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from .core_nexus_client import CoreNexusAPIError, CoreNexusClient
from .storage import ensure_dir, output_account_dir, output_run_dir, output_section_dir

SYNC_SECTION = "sync_payload"
PAYLOAD_FILENAME = "capture_rows_payload.json"
STATE_FILENAME = "sync_state.json"
FAILED_ROWS_FILENAME = "failed_rows.jsonl"
SCHEMA_VERSION = 1


def utc_now_iso() -> str:
    return datetime.now().astimezone().isoformat()


def read_json(path: Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json_atomic(path: Path, data: Any) -> None:
    path = Path(path)
    ensure_dir(path.parent)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def sync_dir_for(base_dir: Path, platform: str, account_alias: str, run_id: str) -> Path:
    return output_section_dir(Path(base_dir) / "output", platform, account_alias, run_id, SYNC_SECTION)


def payload_path_for(base_dir: Path, platform: str, account_alias: str, run_id: str) -> Path:
    return sync_dir_for(base_dir, platform, account_alias, run_id) / PAYLOAD_FILENAME


def state_path_for(base_dir: Path, platform: str, account_alias: str, run_id: str) -> Path:
    return sync_dir_for(base_dir, platform, account_alias, run_id) / STATE_FILENAME


def normalize_persisted_result(raw: Any) -> Dict[str, Any]:
    """Normalize result.json written by ResultStore.save_nested_json.

    The in-memory upload builder expects each item to expose post fields directly,
    while persisted result.json stores items as {"post": {...}}.  This helper
    unwraps that shape without changing the original file.
    """
    if not isinstance(raw, dict):
        return {}
    result = dict(raw)
    items: List[Dict[str, Any]] = []
    for item in raw.get("items") or []:
        if not isinstance(item, dict):
            continue
        post = item.get("post") if isinstance(item.get("post"), dict) else item
        if isinstance(post, dict):
            items.append(dict(post))
    result["items"] = items
    return result


def build_payload_from_result_file(client: CoreNexusClient, result_path: Path) -> Dict[str, Any]:
    raw = read_json(result_path)
    normalized = normalize_persisted_result(raw)
    if not normalized:
        return {"runId": "", "items": []}
    return client.build_intercept_capture_payload(normalized)


def ensure_sync_files(
    *,
    base_dir: Path,
    robot_id: str,
    platform: str,
    account_alias: str,
    payload: Dict[str, Any],
    payload_path: Optional[Path] = None,
    source: str = "run-core-robot",
) -> Dict[str, Any]:
    run_id = str((payload or {}).get("runId") or "").strip()
    if not run_id:
        run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        payload["runId"] = run_id
    sync_dir = sync_dir_for(base_dir, platform, account_alias, run_id)
    payload_path = Path(payload_path) if payload_path else sync_dir / PAYLOAD_FILENAME
    state_path = sync_dir / STATE_FILENAME
    ensure_dir(sync_dir)
    if not payload_path.exists():
        write_json_atomic(payload_path, payload)

    items = payload.get("items") if isinstance(payload, dict) else []
    total_rows = len(items) if isinstance(items, list) else 0
    existing = {}
    if state_path.exists():
        try:
            data = read_json(state_path)
            existing = data if isinstance(data, dict) else {}
        except Exception:
            existing = {}
    now = utc_now_iso()
    state = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "intercept_capture_sync",
        "robotId": str(robot_id or ""),
        "platform": str(platform or ""),
        "accountAlias": str(account_alias or ""),
        "runId": run_id,
        "status": existing.get("status") or "pending",
        "source": existing.get("source") or source,
        "payloadPath": str(payload_path),
        "statePath": str(state_path),
        "createdAt": existing.get("createdAt") or now,
        "updatedAt": now,
        "lastAttemptAt": existing.get("lastAttemptAt") or "",
        "completedAt": existing.get("completedAt") or "",
        "totalRows": total_rows,
        "totalChunks": int(existing.get("totalChunks") or 0),
        "syncedRows": int(existing.get("syncedRows") or 0),
        "syncedChunks": list(existing.get("syncedChunks") or []),
        "lastError": existing.get("lastError") or "",
        "failedChunkIndex": existing.get("failedChunkIndex") or None,
    }
    write_json_atomic(state_path, state)
    return {"runId": run_id, "syncDir": sync_dir, "payloadPath": payload_path, "statePath": state_path, "state": state}


def _compact_failed_row(row: Any, *, error: str, chunk_index: int, local_index: int) -> Dict[str, Any]:
    data = row if isinstance(row, dict) else {}

    def text(key: str, max_len: int = 160) -> str:
        value = data.get(key)
        if value is None:
            return ""
        try:
            value_text = str(value).replace("\x00", "").strip()
        except Exception:
            value_text = ""
        if len(value_text) > max_len:
            return value_text[:max_len] + "..."
        return value_text

    comment_text = data.get("commentText") or data.get("commentContent") or ""
    return {
        "failedAt": utc_now_iso(),
        "chunkIndex": chunk_index,
        "localIndex": local_index,
        "error": error,
        "platform": text("platform", 32),
        "targetType": text("targetType", 32),
        "contentUrl": text("contentUrl", 260),
        "platformContentId": text("platformContentId", 128),
        "commentId": text("commentId", 128),
        "userId": text("userId", 128),
        "nickname": text("nickname", 100),
        "commentTextPreview": text("commentText", 140),
        "commentTextLength": len(str(comment_text)) if comment_text is not None else 0,
    }


def _append_failed_rows(state_path: Path, rows: List[Dict[str, Any]]) -> Path:
    path = Path(state_path).parent / FAILED_ROWS_FILENAME
    ensure_dir(path.parent)
    with path.open("a", encoding="utf-8") as fp:
        for row in rows:
            fp.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
    return path


def _is_splittable_sync_error(exc: Exception) -> bool:
    text = str(exc)
    # Auth, permission, wrong robot id and network problems are system-level failures;
    # splitting rows would only hide the real problem.
    fatal_markers = ("HTTP 401", "HTTP 403", "HTTP 404", "连接失败", "timeout", "timed out")
    if any(marker.lower() in text.lower() for marker in fatal_markers):
        return False
    return any(marker in text for marker in ("HTTP 400", "HTTP 413", "HTTP 422", "HTTP 500"))


def _merge_upload_stats(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    merged: Dict[str, Any] = {
        "responses": [],
        "created": 0,
        "updated": 0,
        "skipped": 0,
        "processedRows": 0,
        "backendFailedRows": 0,
        "clientFailedRows": 0,
        "failedRows": [],
    }
    for item in items:
        merged["responses"].extend(item.get("responses") or [])
        for key in ("created", "updated", "skipped", "processedRows", "backendFailedRows", "clientFailedRows"):
            try:
                merged[key] += int(item.get(key) or 0)
            except Exception:
                pass
        merged["failedRows"].extend(item.get("failedRows") or [])
    return merged


def _upload_chunk_resilient(
    *,
    client: CoreNexusClient,
    robot_id: str,
    chunk_body: Dict[str, Any],
    state_path: Path,
    chunk_index: int,
    total_chunks: int,
    depth: int = 0,
) -> Dict[str, Any]:
    items = chunk_body.get("items") if isinstance(chunk_body, dict) else []
    if not isinstance(items, list):
        items = []
    run_id = str(chunk_body.get("runId") or "") if isinstance(chunk_body, dict) else ""
    rows = len(items)
    try:
        data = client.upload_intercept_capture_chunk(robot_id, chunk_body)
        response = data if isinstance(data, dict) else {"value": data}
        failed_count = 0
        failed_rows: List[Dict[str, Any]] = []
        try:
            failed_count = int(response.get("failed") or 0)
        except Exception:
            failed_count = 0
        raw_failed_rows = response.get("failedRows") if isinstance(response, dict) else []
        if isinstance(raw_failed_rows, list) and raw_failed_rows:
            failed_rows = [row for row in raw_failed_rows if isinstance(row, dict)]
            failed_path = _append_failed_rows(state_path, failed_rows)
            print(f"[SYNC] 后端兼容入库后仍有异常行：chunk={chunk_index}/{total_chunks} failed={len(failed_rows)}，已保存：{failed_path}", flush=True)
        return {
            "responses": [response],
            "created": int(response.get("created") or 0),
            "updated": int(response.get("updated") or 0),
            "skipped": int(response.get("skipped") or 0),
            "processedRows": rows,
            "backendFailedRows": failed_count,
            "clientFailedRows": 0,
            "failedRows": failed_rows,
        }
    except Exception as exc:
        if not _is_splittable_sync_error(exc):
            raise
        if rows <= 1:
            failed_row = _compact_failed_row(items[0] if items else {}, error=str(exc), chunk_index=chunk_index, local_index=0)
            failed_path = _append_failed_rows(state_path, [failed_row])
            print(f"[SYNC] 单条异常数据已隔离并跳过：chunk={chunk_index}/{total_chunks}，已保存：{failed_path}", flush=True)
            return {
                "responses": [],
                "created": 0,
                "updated": 0,
                "skipped": 0,
                "processedRows": rows,
                "backendFailedRows": 0,
                "clientFailedRows": rows,
                "failedRows": [failed_row],
            }
        mid = max(1, rows // 2)
        left_body = {"runId": run_id, "items": items[:mid]}
        right_body = {"runId": run_id, "items": items[mid:]}
        indent = "  " * min(depth, 4)
        print(
            f"[SYNC] 批次失败，自动二分定位：chunk={chunk_index}/{total_chunks} rows={rows} -> {len(items[:mid])}+{len(items[mid:])}，原因={exc}",
            flush=True,
        )
        left = _upload_chunk_resilient(
            client=client,
            robot_id=robot_id,
            chunk_body=left_body,
            state_path=state_path,
            chunk_index=chunk_index,
            total_chunks=total_chunks,
            depth=depth + 1,
        )
        right = _upload_chunk_resilient(
            client=client,
            robot_id=robot_id,
            chunk_body=right_body,
            state_path=state_path,
            chunk_index=chunk_index,
            total_chunks=total_chunks,
            depth=depth + 1,
        )
        merged = _merge_upload_stats([left, right])
        # If every row in this failed chunk fails even after splitting, treat it as a
        # systemic backend/runtime failure instead of silently marking the whole chunk done.
        if rows > 1 and int(merged.get("clientFailedRows") or 0) >= rows and not merged.get("responses"):
            raise CoreNexusAPIError(f"批次 {chunk_index}/{total_chunks} 拆分后全部失败，疑似后端系统级异常：{exc}") from exc
        if merged.get("clientFailedRows"):
            print(
                f"[SYNC] 批次部分异常已隔离：chunk={chunk_index}/{total_chunks}，异常行={merged.get('clientFailedRows')}，其余数据继续同步。",
                flush=True,
            )
        return merged


def upload_payload_with_state(
    *,
    client: CoreNexusClient,
    robot_id: str,
    payload: Dict[str, Any],
    state_path: Path,
    chunk_size: int = 50,
    max_payload_bytes: int = 60_000,
) -> Dict[str, Any]:
    state_path = Path(state_path)
    state = read_json(state_path) if state_path.exists() else {}
    if not isinstance(state, dict):
        state = {}
    chunks = client.preview_intercept_upload_chunks(payload, chunk_size=chunk_size, max_payload_bytes=max_payload_bytes)
    total_rows = len(payload.get("items") or []) if isinstance(payload, dict) else 0
    already_synced = set()
    for value in state.get("syncedChunks") or []:
        try:
            already_synced.add(int(value))
        except Exception:
            pass
    responses: List[Dict[str, Any]] = []
    total_created = 0
    total_updated = 0
    total_skipped = 0
    backend_failed_rows = int(state.get("backendFailedRows") or 0)
    client_failed_rows = int(state.get("clientFailedRows") or 0)
    failed_rows_path = str(Path(state_path).parent / FAILED_ROWS_FILENAME)
    synced_rows = 0
    for chunk_info in chunks:
        if not isinstance(chunk_info, dict):
            continue
        index = int(chunk_info.get("index") or 0)
        rows = int(chunk_info.get("rows") or 0)
        if index in already_synced:
            synced_rows += rows

    state.update(
        {
            "status": "syncing" if chunks else "synced",
            "updatedAt": utc_now_iso(),
            "lastAttemptAt": utc_now_iso(),
            "totalRows": total_rows,
            "totalChunks": len(chunks),
            "syncedRows": synced_rows,
            "lastError": "",
            "failedChunkIndex": None,
            "backendFailedRows": backend_failed_rows,
            "clientFailedRows": client_failed_rows,
            "failedRowsPath": failed_rows_path,
        }
    )
    if not chunks:
        state["completedAt"] = utc_now_iso()
    write_json_atomic(state_path, state)

    if not chunks:
        return {"received": 0, "created": 0, "updated": 0, "skipped": 0, "chunks": 0, "responses": []}

    for chunk_info in chunks:
        if not isinstance(chunk_info, dict):
            continue
        index = int(chunk_info.get("index") or 0)
        rows = int(chunk_info.get("rows") or 0)
        chunk_bytes = int(chunk_info.get("bytes") or 0)
        chunk_body = chunk_info.get("body")
        if index in already_synced:
            print(f"[SYNC] 跳过已成功批次：{index}/{len(chunks)} rows={rows} bytes={chunk_bytes}", flush=True)
            continue
        if not isinstance(chunk_body, dict):
            continue
        print(f"[SYNC] 正在同步批次：{index}/{len(chunks)} rows={rows} bytes={chunk_bytes}", flush=True)
        try:
            data = _upload_chunk_resilient(
                client=client,
                robot_id=robot_id,
                chunk_body=chunk_body,
                state_path=state_path,
                chunk_index=index,
                total_chunks=len(chunks),
            )
        except Exception as exc:
            state.update(
                {
                    "status": "sync_failed",
                    "updatedAt": utc_now_iso(),
                    "lastError": str(exc),
                    "failedChunkIndex": index,
                    "pendingRows": max(0, total_rows - int(state.get("syncedRows") or 0)),
                }
            )
            write_json_atomic(state_path, state)
            raise CoreNexusAPIError(
                f"截流捕获数据同步失败：第 {index}/{len(chunks)} 批，rows={rows}，bytes={chunk_bytes}，{exc}"
            ) from exc
        responses.extend(data.get("responses") or [])
        total_created += int(data.get("created") or 0)
        total_updated += int(data.get("updated") or 0)
        total_skipped += int(data.get("skipped") or 0)
        backend_failed_rows += int(data.get("backendFailedRows") or 0)
        client_failed_rows += int(data.get("clientFailedRows") or 0)
        already_synced.add(index)
        state["syncedChunks"] = sorted(already_synced)
        state["syncedRows"] = int(state.get("syncedRows") or 0) + rows
        state["pendingRows"] = max(0, total_rows - int(state.get("syncedRows") or 0))
        state["backendFailedRows"] = backend_failed_rows
        state["clientFailedRows"] = client_failed_rows
        state["updatedAt"] = utc_now_iso()
        state["lastError"] = ""
        state["failedChunkIndex"] = None
        write_json_atomic(state_path, state)
        if data.get("backendFailedRows") or data.get("clientFailedRows"):
            print(
                f"[SYNC] 批次同步完成但存在异常行：{index}/{len(chunks)}，"
                f"backendFailed={data.get('backendFailedRows', 0)}，clientFailed={data.get('clientFailedRows', 0)}",
                flush=True,
            )
        else:
            print(f"[SYNC] 批次同步成功：{index}/{len(chunks)}", flush=True)

    final_status = "synced" if backend_failed_rows == 0 and client_failed_rows == 0 else "synced_with_failed_rows"
    state.update(
        {
            "status": final_status,
            "updatedAt": utc_now_iso(),
            "completedAt": utc_now_iso(),
            "pendingRows": 0,
            "lastError": "",
            "failedChunkIndex": None,
            "backendFailedRows": backend_failed_rows,
            "clientFailedRows": client_failed_rows,
            "failedRowsPath": failed_rows_path,
        }
    )
    write_json_atomic(state_path, state)
    if final_status == "synced_with_failed_rows":
        print(
            f"[SYNC] 同步完成但存在异常行：backendFailed={backend_failed_rows}，clientFailed={client_failed_rows}，详情={failed_rows_path}",
            flush=True,
        )
    return {
        "received": total_rows,
        "created": total_created,
        "updated": total_updated,
        "skipped": total_skipped,
        "chunks": len(chunks),
        "responses": responses,
        "backendFailedRows": backend_failed_rows,
        "clientFailedRows": client_failed_rows,
        "failedRowsPath": failed_rows_path,
    }


def load_payload_for_task(client: CoreNexusClient, task: Dict[str, Any]) -> Dict[str, Any]:
    payload_path = Path(task.get("payloadPath") or "")
    result_path = Path(task.get("resultPath") or "")
    if payload_path.exists():
        data = read_json(payload_path)
        return data if isinstance(data, dict) else {"runId": "", "items": []}
    if result_path.exists():
        return build_payload_from_result_file(client, result_path)
    return {"runId": "", "items": []}


def find_resume_task(
    *,
    base_dir: Path,
    robot_id: str,
    platform: str,
    account_alias: str,
    run_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    account_dir = output_account_dir(Path(base_dir) / "output", platform, account_alias)
    if not account_dir.exists():
        return None
    candidates: List[Dict[str, Any]] = []
    run_dirs = []
    if run_id:
        run_dirs = [output_run_dir(Path(base_dir) / "output", platform, account_alias, run_id)]
    else:
        run_dirs = [p for p in account_dir.iterdir() if p.is_dir()]
        run_dirs.sort(key=lambda p: p.stat().st_mtime if p.exists() else 0, reverse=True)

    for run_dir in run_dirs:
        if not run_dir.exists() or not run_dir.is_dir():
            continue
        sync_dir = run_dir / SYNC_SECTION
        state_path = sync_dir / STATE_FILENAME
        payload_path = sync_dir / PAYLOAD_FILENAME
        result_path = run_dir / "result.json"
        state: Dict[str, Any] = {}
        status = ""
        if state_path.exists():
            try:
                data = read_json(state_path)
                state = data if isinstance(data, dict) else {}
                status = str(state.get("status") or "")
            except Exception:
                status = "state_read_failed"
        has_payload = payload_path.exists()
        has_result = result_path.exists()
        if status in {"synced", "synced_with_failed_rows"} and not run_id:
            continue
        if state_path.exists() or has_payload or has_result:
            priority = 0
            if status in {"sync_failed", "pending", "syncing"}:
                priority = 100
            elif has_payload and not state_path.exists():
                priority = 80
            elif has_result and not state_path.exists():
                priority = 50
            try:
                mtime = max(
                    path.stat().st_mtime
                    for path in (state_path, payload_path, result_path)
                    if path.exists()
                )
            except Exception:
                mtime = 0.0
            candidates.append(
                {
                    "priority": priority,
                    "mtime": mtime,
                    "runId": run_dir.name,
                    "runDir": str(run_dir),
                    "syncDir": str(sync_dir),
                    "statePath": str(state_path),
                    "payloadPath": str(payload_path),
                    "resultPath": str(result_path),
                    "state": state,
                    "status": status or ("payload_without_state" if has_payload else "result_without_state"),
                    "robotId": robot_id,
                    "platform": platform,
                    "accountAlias": account_alias,
                }
            )
    if not candidates:
        return None
    candidates.sort(key=lambda x: (int(x.get("priority") or 0), float(x.get("mtime") or 0.0)), reverse=True)
    return candidates[0]
