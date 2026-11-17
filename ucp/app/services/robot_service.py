from __future__ import annotations

from dataclasses import dataclass

from app.services.http_client import HttpClient


@dataclass
class Robot:
    """机器人模型。"""
    id: str
    name: str
    platform: str
    bot_type: str  # 'dm' 或 'comment'
    status: str  # 'idle', 'running', 'stopped', 等
    device_id: str | None = None
    tenant_id: str | None = None

    @staticmethod
    def from_dict(data: dict) -> Robot:
        return Robot(
            id=str(data.get("id", "")),
            name=str(data.get("name", "")),
            platform=str(data.get("platform", "douyin")),
            bot_type=str(data.get("type", "dm")),  # dm, comment, etc
            status=str(data.get("status", "idle")),
            device_id=data.get("device_id"),
            tenant_id=data.get("tenant_id"),
        )


class RobotService:
    """机器人服务 - 调用远程API管理机器人。"""

    def __init__(self, api_base_url: str = "http://localhost:3000", access_token: str | None = None):
        self.client = HttpClient(api_base_url, access_token)

    def list_robots(self, page: int = 1, limit: int = 50) -> list[Robot]:
        """获取机器人列表。"""
        try:
            response = self.client.get("/api/v1/robots", {"page": page, "limit": limit})
            if response.get("code") == 0 and "data" in response:
                items = response["data"].get("items", [])
                return [Robot.from_dict(item) for item in items]
            return []
        except Exception as e:
            print(f"Error fetching robots: {e}")
            return []

    def get_robot(self, robot_id: str) -> Robot | None:
        """获取机器人详情。"""
        try:
            response = self.client.get(f"/api/v1/robots/{robot_id}")
            if response.get("code") == 0 and "data" in response:
                return Robot.from_dict(response["data"])
            return None
        except Exception as e:
            print(f"Error fetching robot {robot_id}: {e}")
            return None

    def start_robot(self, robot_id: str) -> bool:
        """启动机器人。"""
        try:
            response = self.client.post(f"/api/v1/robots/{robot_id}/start")
            return response.get("code") == 0
        except Exception as e:
            print(f"Error starting robot {robot_id}: {e}")
            return False

    def stop_robot(self, robot_id: str) -> bool:
        """停止机器人。"""
        try:
            response = self.client.post(f"/api/v1/robots/{robot_id}/stop")
            return response.get("code") == 0
        except Exception as e:
            print(f"Error stopping robot {robot_id}: {e}")
            return False

    def create_robot(self, name: str, platform: str, bot_type: str, 
                    device_id: str | None = None, tenant_id: str | None = None) -> Robot | None:
        """创建新机器人。"""
        try:
            data = {
                "name": name,
                "platform": platform,
                "type": bot_type,
                "device_id": device_id,
                "tenant_id": tenant_id,
            }
            response = self.client.post("/api/v1/robots", data)
            if response.get("code") == 0 and "data" in response:
                return Robot.from_dict(response["data"])
            return None
        except Exception as e:
            print(f"Error creating robot: {e}")
            return None

    def delete_robot(self, robot_id: str) -> bool:
        """删除机器人。"""
        try:
            response = self.client.delete(f"/api/v1/robots/{robot_id}")
            return response.get("code") == 0
        except Exception as e:
            print(f"Error deleting robot {robot_id}: {e}")
            return False

    def list_devices(self, page: int = 1, limit: int = 50) -> list[dict]:
        """获取机器人设备列表。"""
        try:
            response = self.client.get("/api/v1/robots/devices", {"page": page, "limit": limit})
            if response.get("code") == 0 and "data" in response:
                return response["data"].get("items", [])
            return []
        except Exception as e:
            print(f"Error fetching devices: {e}")
            return []

    def list_auths(self, page: int = 1, limit: int = 50) -> list[dict]:
        """获取机器人授权列表。"""
        try:
            response = self.client.get("/api/v1/robots/auths", {"page": page, "limit": limit})
            if response.get("code") == 0 and "data" in response:
                return response["data"].get("items", [])
            return []
        except Exception as e:
            print(f"Error fetching auths: {e}")
            return []
