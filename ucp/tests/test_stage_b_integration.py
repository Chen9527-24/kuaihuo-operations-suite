from __future__ import annotations

import ast
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class StageBIntegrationTests(unittest.TestCase):
    def test_controller_constructors_accept_record_service(self) -> None:
        for relative, class_name in (
            ("app/platforms/douyin/session_controller.py", "SessionController"),
            ("app/platforms/wechat_video/session_controller.py", "WeChatVideoSessionController"),
        ):
            tree = ast.parse((ROOT / relative).read_text(encoding="utf-8"))
            constructor = None
            for node in tree.body:
                if isinstance(node, ast.ClassDef) and node.name == class_name:
                    constructor = next(
                        (item for item in node.body if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)) and item.name == "__init__"),
                        None,
                    )
                    break
            self.assertIsNotNone(constructor, relative)
            names = [arg.arg for arg in constructor.args.args + constructor.args.kwonlyargs]
            self.assertIn("record_service", names, relative)

    def test_main_window_owns_service_and_drains_before_robot_shutdown(self) -> None:
        text = (ROOT / "app/main_window.py").read_text(encoding="utf-8")
        self.assertIn("LocalRecordService(", text)
        self.assertIn("NullLocalRecordService()", text)
        self.assertIn("self.local_record_service.register_account(acc)", text)
        close_start = text.index("    def closeEvent(")
        close_body = text[close_start:]
        self.assertLess(close_body.index("self.local_record_service.begin_draining()"), close_body.index("self._stop_all_local_robots_for_shutdown()"))
        self.assertLess(close_body.index("self._stop_all_local_robots_for_shutdown()"), close_body.index("self.local_record_service.close(timeout=3.0)"))

    def test_runtime_dependency_and_ignore_rules_are_present(self) -> None:
        requirements = {line.strip().lower() for line in (ROOT / "requirements.txt").read_text(encoding="utf-8").splitlines() if line.strip()}
        self.assertIn("tzdata", requirements)
        ignore_rules = {line.strip() for line in (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines() if line.strip()}
        for rule in ("records/", "*.sqlite", "*.sqlite-wal", "*.sqlite-shm"):
            self.assertIn(rule, ignore_rules)


if __name__ == "__main__":
    unittest.main(verbosity=2)
