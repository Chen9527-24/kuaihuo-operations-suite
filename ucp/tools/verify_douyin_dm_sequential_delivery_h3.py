from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
passed = 0


def check(name: str, condition: bool) -> None:
    global passed
    if not condition:
        raise AssertionError(name)
    passed += 1
    print(f"PASS {passed:02d} {name}")


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


draft = read("app/platforms/douyin/dm/draft/draft_runtime.py")
aggregate = read("app/platforms/douyin/dm/aggregate/aggregate_runtime.py")
send = read("app/platforms/douyin/dm/send/send_runtime.py")
warmup = read("app/platforms/douyin/dm/runtime/warmup_gate.py")
queue = read("app/platforms/douyin/dm/queue/unread_queue.py")
probe = read("app/platforms/douyin/state/probe/probe_result.py")
controller = read("app/platforms/douyin/session_controller.py")

check("优先使用 Core 返回的真实 delivery segments", 'raw.get("segments")' in draft and 'delayBeforeMs' in draft)
check("私聊保留多个 segments 而群聊合并为一条", 'conversation_type == "group" and len(normalized) > 1' in draft)
check("草稿缓存保存完整投递计划", '"deliverySegments": delivery_segments' in aggregate and '"fullText": full_draft_text' in aggregate)
check("同步与异步草稿路径都携带段索引和已发送段", aggregate.count('"deliverySegmentIndex": 0') >= 1 and '"sentSegments": []' in aggregate and '"deliverySegmentIndex": 0' in send)
check("发送链路不再引用作用域外 cached_meta", 'cached_meta.get("deliverySegments")' not in send.split('def _handle_dm_send_reply_result', 1)[0])
check("首段确认后按计划调度下一段", '_schedule_next_dm_delivery_segment(payload)' in send and 'QTimer.singleShot(delay_ms' in send)
check("下一段发送前重新确认会话和客户新消息", '当前会话已经切换' in send and '客户在等待期间发来了新消息' in send)
check("策略可控制客户插话后是否取消剩余段", 'payload.get("cancelRemainingOnCustomerMessage") is not False' in send)
check("会话锁持续占用有重试上限", '因会话锁持续占用已取消' in send and 'attempts > 16' in send)
check("登录丢失、任务重置和活动状态均纳入分段序列", 'self.dm_pending_delivery_sequence = None' in probe and controller.count('self.dm_pending_delivery_sequence = None') >= 2 and 'dm_pending_delivery_sequence' in warmup)
check("pending timeout 会保护正在等待的后续分段", '"dm_pending_delivery_sequence"' in queue)
check("评论代码未进入本次逐段发送范围", 'comment' not in send.lower())

# Execute the scheduling method with a fake timer to prove the next segment payload is built correctly.
scheduled: list[tuple[int, object]] = []
class FakeTimer:
    @staticmethod
    def singleShot(delay: int, callback: object) -> None:
        scheduled.append((delay, callback))

# The verification environment intentionally has no GUI dependency; provide only the QTimer contract used by this module.
pyside = ModuleType("PySide6")
qtcore = ModuleType("PySide6.QtCore")
qtcore.QTimer = FakeTimer
sys.modules.setdefault("PySide6", pyside)
sys.modules["PySide6.QtCore"] = qtcore

# Avoid importing the full Qt application package; this method only needs module-level symbols to exist.
app_module = ModuleType("app")
services_module = ModuleType("app.services")
dm_reply_module = ModuleType("app.services.dm_reply")
utils_module = ModuleType("app.services.dm_reply.utils")
utils_module.build_aggregate_signature = lambda *_args, **_kwargs: ""
utils_module.build_draft_cache_key = lambda *_args, **_kwargs: ""
platforms_module = ModuleType("app.platforms")
douyin_module = ModuleType("app.platforms.douyin")
common_module = ModuleType("app.platforms.douyin.common")
js_module = ModuleType("app.platforms.douyin.common.js_scripts")
for name in (
    "build_dm_inspect_script", "build_dm_open_session_script", "build_dm_reply_precheck_script",
    "build_dm_scroll_list_script", "build_dm_send_reply_script", "build_dm_stage_reply_script",
):
    setattr(js_module, name, lambda *_args, **_kwargs: "")
sys.modules.update({
    "app": app_module,
    "app.services": services_module,
    "app.services.dm_reply": dm_reply_module,
    "app.services.dm_reply.utils": utils_module,
    "app.platforms": platforms_module,
    "app.platforms.douyin": douyin_module,
    "app.platforms.douyin.common": common_module,
    "app.platforms.douyin.common.js_scripts": js_module,
})

module_path = ROOT / "app/platforms/douyin/dm/send/send_runtime.py"
spec = importlib.util.spec_from_file_location("h3_send_runtime", module_path)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)
class FakeController:
    dm_pending_delivery_sequence = None
    def _log(self, *_args, **_kwargs):
        pass
    def _start_next_dm_delivery_segment_guard(self):
        pass

fake = FakeController()
payload = {
    "signature": "sig",
    "replyToken": "token",
    "baseReplyToken": "token",
    "deliverySegmentIndex": 0,
    "sentSegments": ["第一条"],
    "deliverySegments": [
        {"index": 0, "content": "第一条", "delayBeforeMs": 0},
        {"index": 1, "content": "第二条", "delayBeforeMs": 850},
    ],
}
ok = module.SessionControllerDMSendMixin._schedule_next_dm_delivery_segment(fake, payload)
check("实际调度函数创建第二段状态", ok and fake.dm_pending_delivery_sequence["draftText"] == "第二条" and fake.dm_pending_delivery_sequence["deliverySegmentIndex"] == 1)
check("实际调度函数保留 850ms 段间延迟", scheduled and scheduled[0][0] == 850)

print(f"\nV5.20-H3 UCP 抖音私信逐段发送定向验证通过：{passed} 项。")
