# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path
import os
import sys

ROOT = Path(SPECPATH)
sys.path.insert(0, str(ROOT))
from build_exe import _copy_runtime_assets

APP_NAME = os.getenv("UCP_EXE_NAME", "UCP-local")
if not APP_NAME or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for c in APP_NAME):
    raise ValueError("Invalid build name")
API_BASE_URL = os.getenv("UCP_API_BASE_URL", "http://localhost:3000")
a = Analysis([str(ROOT / "run.py")], pathex=[str(ROOT)], binaries=[], datas=[],
             hiddenimports=["PySide6.QtWebEngineWidgets", "PySide6.QtWebEngineCore"],
             hookspath=[], hooksconfig={}, runtime_hooks=[], excludes=[], noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name=APP_NAME, console=False)
coll = COLLECT(exe, a.binaries, a.datas, name=APP_NAME)
_copy_runtime_assets(ROOT / "dist" / APP_NAME, ROOT / ".env.example", API_BASE_URL)
