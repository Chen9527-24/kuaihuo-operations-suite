from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class StageC12IntegrationTests(unittest.TestCase):
    def test_c12_files_and_guards_exist(self) -> None:
        js = (ROOT / "app/platforms/douyin/common/js_scripts.py").read_text(encoding="utf-8")
        record = (ROOT / "app/platforms/douyin/dm/recording/record_runtime.py").read_text(encoding="utf-8")
        self.assertIn("explicitMessageText", js)
        self.assertIn("_dm_record_unread_count_hint", record)
        self.assertIn("_dm_record_initial_live_indexes", record)
        self.assertIn("live_observed", record)


if __name__ == "__main__":
    unittest.main()
