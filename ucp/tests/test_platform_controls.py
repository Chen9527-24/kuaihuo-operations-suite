from __future__ import annotations

import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class SignalStub:
    def __init__(self, *args):
        pass

    def connect(self, callback):
        pass

    def emit(self, *args):
        pass


class WidgetStub:
    def __init__(self, text="", *args):
        self.text = text
        self.enabled = True
        self.tooltip = ""
        self.checked = False
        self.clicked = SignalStub()

    def setEnabled(self, enabled):
        self.enabled = enabled

    def setToolTip(self, text):
        self.tooltip = text

    def setChecked(self, checked):
        self.checked = checked

    def __getattr__(self, name):
        return lambda *args, **kwargs: None


class PlatformControlTests(unittest.TestCase):
    def test_live_top_bar_disables_only_unimplemented_platforms(self):
        tree = ast.parse((ROOT / "app/widgets/top_bar.py").read_text())
        cls = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "TopBar")
        namespace = {name: WidgetStub for name in ("QButtonGroup", "QFrame", "QHBoxLayout", "QLabel", "QPushButton", "QVBoxLayout")}
        namespace.update(Signal=SignalStub, PLATFORM_NAMES={"DOUYIN": "抖音", "WECHAT_VIDEO": "视频号", "KUAISHOU": "快手", "XIAOHONGSHU": "小红书"})
        exec(compile(ast.fix_missing_locations(ast.Module(body=[cls], type_ignores=[])), "top_bar_widget", "exec"), namespace)
        bar = namespace["TopBar"]()
        for platform in ("KUAISHOU", "XIAOHONGSHU"):
            button = bar.platform_buttons[platform]
            self.assertFalse(button.enabled)
            self.assertIn("未实现", button.text)
            self.assertIn("仅实现", button.tooltip)
        for platform in ("DOUYIN", "WECHAT_VIDEO"):
            self.assertTrue(bar.platform_buttons[platform].enabled)
            self.assertNotIn("未实现", bar.platform_buttons[platform].text)
        self.assertTrue(bar.platform_buttons["DOUYIN"].checked)


if __name__ == "__main__":
    unittest.main()
