from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services.dm_reply.config import _apply_env_overrides

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("ucp_public_build", ROOT / "build_exe.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class PublicConfigurationTests(unittest.TestCase):
    def test_build_excludes_private_runtime_files_and_environment(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "source"
            defaults = root / "data/platforms/douyin"
            defaults.mkdir(parents=True)
            for filename in builder.PUBLIC_DATA_FILES:
                (defaults / filename).write_text('{"coze":{"token":"","workflow_id":""}}')
            (root / "data/accounts.json").write_text('[{"id":"private-account"}]')
            (root / "README.md").write_text("public")
            (root / "LICENSE").write_bytes(b"license-verbatim-test\n")
            (root / "NOTICE").write_bytes(b"notice-verbatim-test\n")
            (root / "docs").mkdir()
            (root / "docs/CONFIGURATION.md").write_text("public")
            (root / ".env.example").write_text("COZE_TOKEN=private-test-token\nDM_DEBUG_VERBOSE=0\n")
            target = Path(temporary) / "release"
            (target / "config").mkdir(parents=True)
            (target / "config/old-session.json").write_text("private")
            with patch.object(builder, "ROOT", root):
                builder._copy_runtime_assets(target, root / ".env.example", "http://localhost:3000")
            self.assertEqual((root / "LICENSE").read_bytes(), (target / "LICENSE").read_bytes())
            self.assertEqual((root / "NOTICE").read_bytes(), (target / "NOTICE").read_bytes())
            self.assertFalse((target / "data/accounts.json").exists())
            self.assertEqual([], list((target / "config").iterdir()))
            self.assertNotIn("COZE_TOKEN", (target / ".env").read_text())
            self.assertNotIn("private-test-token", (target / ".env.example").read_text())

    def test_build_refuses_missing_license_documents(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with patch.object(builder, "ROOT", root), self.assertRaises(FileNotFoundError):
                builder._copy_runtime_assets(root / "release", root / ".env.example", "http://localhost:3000")
            self.assertFalse((root / "release").exists())

    def test_build_rejects_nonempty_nested_credentials(self):
        with self.assertRaises(ValueError):
            builder._check_public_config({"reply": {"coze": {"token": "synthetic-secret"}}})
        with self.assertRaises(ValueError):
            builder._check_public_config({"workflowId": "synthetic-workflow"})

    def test_cloud_requires_opt_in_even_if_json_has_credentials(self):
        config = {"coze": {"enabled": True, "token": "test-token", "workflow_id": "test-workflow"}}
        with patch.dict(os.environ, {}, clear=True), patch("app.services.dm_reply.config._read_dotenv_values", return_value={}):
            self.assertFalse(_apply_env_overrides(config)["coze"]["enabled"])

    def test_cloud_reads_dotenv_only_with_complete_opt_in(self):
        values = {"COZE_ENABLED": "1", "COZE_TOKEN": "test-token", "COZE_WORKFLOW_ID": "test-workflow"}
        with patch.dict(os.environ, {}, clear=True), patch("app.services.dm_reply.config._read_dotenv_values", return_value=values):
            self.assertTrue(_apply_env_overrides({})["coze"]["enabled"])
        values.pop("COZE_TOKEN")
        with patch.dict(os.environ, {}, clear=True), patch("app.services.dm_reply.config._read_dotenv_values", return_value=values):
            self.assertFalse(_apply_env_overrides({})["coze"]["enabled"])
