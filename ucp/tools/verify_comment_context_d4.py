from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECKS = {
    "local comment context query": (ROOT / "app/services/local_records/service.py", "def recent_comment_messages"),
    "comment payload thread id": (ROOT / "app/services/auto_reply_runtime.py", '"commentThreadId"'),
    "comment payload context list": (ROOT / "app/services/auto_reply_runtime.py", '"threadContext"'),
    "page context fallback": (ROOT / "app/platforms/douyin/comment/reply/reply_editor.py", "def _comment_context_page_rows"),
    "local sqlite context": (ROOT / "app/platforms/douyin/comment/reply/reply_editor.py", "def _comment_context_local_rows"),
    "current target exclusion": (ROOT / "app/platforms/douyin/comment/reply/reply_editor.py", "def _comment_context_remove_current_target"),
    "bounded context": (ROOT / "app/platforms/douyin/comment/reply/reply_editor.py", "contextCount"),
    "context load log": (ROOT / "app/platforms/douyin/comment/reply/reply_editor.py", "评论上下文加载完成"),
    "context test": (ROOT / "tests/test_stage_d4_comment_context.py", "CommentContextD4Tests"),
}

failed = []
for name, (path, token) in CHECKS.items():
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    if token not in text:
        failed.append(name)

if failed:
    raise SystemExit("Comment context verification failed: " + ", ".join(failed))
print(f"Comment context verification passed: {len(CHECKS)} checks.")
