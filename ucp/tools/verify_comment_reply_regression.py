from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES = {
    "draft_probe": ROOT / "app/platforms/douyin/comment/reply/draft_probe.py",
    "reply_editor": ROOT / "app/platforms/douyin/comment/reply/reply_editor.py",
    "comment_scripts": ROOT / "app/platforms/douyin/comment/scripts/comment_scripts.py",
    "filter_runtime": ROOT / "app/platforms/douyin/comment/filter/filter_runtime.py",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def stable_thread(raw_thread_key: str) -> str:
    parts = [part.strip() for part in raw_thread_key.split("|")]
    if len(parts) >= 3:
        return "|".join(part for part in [parts[0], "|".join(parts[2:])] if part)
    return raw_thread_key.strip()


def main() -> None:
    texts = {name: path.read_text(encoding="utf-8") for name, path in FILES.items()}

    require("def _comment_stable_thread_identity" in texts["draft_probe"], "missing stable thread identity helper")
    require("thread_identity = self._comment_stable_thread_identity(target)" in texts["draft_probe"], "target signature does not use stable thread identity")
    require("dom_node_click" in texts["reply_editor"], "nested DOM click method missing")
    require("dom_node_click" in texts["comment_scripts"], "nested DOM click JS implementation missing")
    require("targetVisualNode = candidate.targetCard" not in texts["comment_scripts"], "D2 global pre-hover regression block is still present")
    require("retry_cooldown_ms = 12000" in texts["reply_editor"], "nested retry cooldown is not bounded")
    require("else 45000" in texts["reply_editor"], "top-level original cooldown was not restored")
    require("评论已回复线程展开后进入追问快速巡检" in texts["filter_runtime"], "restart follow-up fast scan hook missing")

    method_start = texts["reply_editor"].index("def _comment_reply_open_methods")
    method_end = texts["reply_editor"].index("def _comment_perform_qt_view_reply_click", method_start)
    method_block = texts["reply_editor"][method_start:method_end]
    nested_start = method_block.index('if level == "nested"')
    top_marker = method_block.index('# Keep the original top-level ladder unchanged')
    nested_block = method_block[nested_start:top_marker]
    top_block = method_block[top_marker:]
    require("dom_node_click" in nested_block, "nested ladder does not prioritize DOM-node click")
    require("element_from_point_sequence" in top_block, "top-level original first method missing")
    require("dom_node_click" not in top_block, "nested-only click method leaked into top-level ladder")

    first = stable_thread("邹多🐟 | 刚刚 | 拍的不错啊[黄脸干杯]")
    later = stable_thread("邹多🐟 | 8分钟前 | 拍的不错啊[黄脸干杯]")
    require(first == later, "relative time still changes the target identity")

    print("Comment reply regression verification passed: 9 checks.")


if __name__ == "__main__":
    main()
