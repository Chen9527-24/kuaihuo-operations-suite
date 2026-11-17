from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from app.models import Account


class AccountService:
    """样例账号服务。

    现在先从本地 JSON 读取。
    后续你可以把 fetch_accounts() 替换成你们自己的 PC 后台接口请求。
    """

    def __init__(self, json_path: Path) -> None:
        self.json_path = json_path

    def fetch_accounts(self) -> list[Account]:
        data = json.loads(self.json_path.read_text(encoding="utf-8"))
        return [self._to_account(item) for item in data]

    @staticmethod
    def _to_account(item: dict) -> Account:
        return Account(
            id=str(item["id"]),
            platform=str(item["platform"]),
            name=str(item["name"]),
            robot_name=str(item.get("robot_name", "")),
            status=str(item.get("status", "未启动")),
            dm_robot_id=str(item.get("dm_robot_id", "")),
            dm_robot_status=str(item.get("dm_robot_status", "未启动")),
            comment_robot_id=str(item.get("comment_robot_id", "")),
            comment_robot_status=str(item.get("comment_robot_status", "未启动")),
        )
