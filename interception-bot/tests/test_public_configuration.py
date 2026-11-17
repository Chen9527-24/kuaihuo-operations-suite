from __future__ import annotations

import ast
import base64
import json
import os
import shutil
import tempfile
import unittest
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from src.account_sync_service import AccountSyncService
from src.cli import build_parser
from src.speech_analysis import _resolve_whisper_model

ROOT = Path(__file__).resolve().parents[1]


class PublicConfigurationTests(unittest.TestCase):
    def test_distribution_license_copy_preserves_bytes(self):
        source = (ROOT / "authorized-content-sync.spec").read_text()
        # Execute only the public-document post-collect block, without PyInstaller.
        block = source[source.index("release_dir = Path(DISTPATH)"):]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "LICENSE").write_bytes(b"license-verbatim-test\n")
            (root / "NOTICE").write_bytes(b"notice-verbatim-test\n")
            release = root / "dist" / "test-build"
            release.mkdir(parents=True)
            exec(compile(block, "license-copy", "exec"), {"Path": Path, "DISTPATH": str(root / "dist"), "build_name": "test-build", "project_dir": root, "shutil": shutil})
            for name in ("LICENSE", "NOTICE"):
                self.assertEqual((root / name).read_bytes(), (release / name).read_bytes())

    def test_missing_workflow_never_calls_backend_default(self):
        service = object.__new__(AccountSyncService)
        item = SimpleNamespace()
        result = service._run_work_decision(item, fail_strategy="RUN", workflow_id="")
        self.assertFalse(result["should_collect_comments"])
        self.assertEqual("CONFIG_MISSING", item.work_decision_status)

    def test_source_model_download_is_off_without_explicit_opt_in(self):
        with patch.dict(os.environ, {}, clear=True), tempfile.TemporaryDirectory() as temporary:
            with patch("src.speech_analysis.app_root", return_value=Path(temporary)):
                with self.assertRaises(RuntimeError):
                    _resolve_whisper_model("")
                with self.assertRaises(RuntimeError):
                    _resolve_whisper_model("synthetic-missing-model")

    def test_local_model_folder_needs_no_download(self):
        with tempfile.TemporaryDirectory() as temporary:
            with patch.dict(os.environ, {}, clear=True):
                self.assertEqual(str(Path(temporary)), _resolve_whisper_model(temporary))

    def test_unsupported_platform_is_rejected_before_browser_launch(self):
        with self.assertRaises(SystemExit):
            build_parser().parse_args(["login", "--platform", "xiaohongshu", "--account-alias", "test"])

    def test_environment_address_overrides_saved_gui_setting(self):
        # Extract pure settings classes without importing or starting Qt/WebEngine.
        tree = ast.parse((ROOT / "src/gui_app.py").read_text())
        classes = [node for node in tree.body if isinstance(node, ast.ClassDef) and node.name in {"GuiSettings", "SettingsStore"}]
        module = ast.Module(body=classes, type_ignores=[])
        namespace = {"__name__": __name__, "dataclass": dataclass, "Path": Path, "os": os, "json": json, "base64": base64}
        exec(compile(ast.fix_missing_locations(module), "settings_subset", "exec"), namespace)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "config").mkdir()
            (root / "config/gui_settings.json").write_text('{"apiBaseUrl":"http://localhost:3001"}')
            with patch.dict(os.environ, {"CORE_NEXUS_API_BASE_URL": "http://localhost:3002"}, clear=True):
                settings = namespace["SettingsStore"](root).load()
                self.assertEqual("http://localhost:3002", settings.api_base_url)
