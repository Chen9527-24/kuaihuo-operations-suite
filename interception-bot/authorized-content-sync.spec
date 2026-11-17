# -*- mode: python ; coding: utf-8 -*-
import os
import json
import shutil
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

project_dir = Path.cwd()
build_name = os.environ.get("ACS_BUILD_NAME", "authorized-content-sync")

# Packaging policy:
# - Keep Playwright runtime data and the package-local headless shell.
# - Do NOT collect the whole PySide6 package; PyInstaller Qt hooks will include
#   only the Qt modules/resources imported by the application. Collecting all of
#   PySide6 pulls many unused Qt modules and can increase the release by hundreds
#   of MB.
datas = []
datas += collect_data_files("playwright")
# faster-whisper ships runtime assets such as silero_vad_v*.onnx.
# They are required when vad_filter=True; without them packaged builds fail
# before transcription starts. Keep this narrow package data collection while
# still excluding unrelated large Qt modules below.
datas += collect_data_files("faster_whisper")

try:
    import playwright  # type: ignore
    playwright_root = Path(playwright.__file__).resolve().parent
    local_browsers = playwright_root / "driver" / "package" / ".local-browsers"
    if local_browsers.exists():
        datas.append((str(local_browsers), "playwright/driver/package/.local-browsers"))
except Exception:
    pass

def check_example(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if str(key).lower() in {"password", "token", "access_token", "refresh_token", "workflowid", "workflow_id", "cookies"} and item not in ("", None, [], {}):
                raise ValueError(f"Refusing to package private example field: {key}")
            check_example(item)
    elif isinstance(value, list):
        for item in value:
            check_example(item)

for folder in ("selector_overrides", "config_examples"):
    for example in sorted((project_dir / folder).glob("*.example.json")):
        check_example(json.loads(example.read_text(encoding="utf-8")))
        datas.append((str(example), folder))
for document in ("LICENSE", "NOTICE"):
    if not (project_dir / document).is_file():
        raise FileNotFoundError(f"Required distribution document is missing: {document}")

datas += [
    (str(project_dir / "LICENSE"), "."),
    (str(project_dir / "NOTICE"), "."),
    (str(project_dir / "README.md"), "."),
    (str(project_dir / ".env.example"), "."),
    (str(project_dir / "docs" / "CONFIGURATION.md"), "docs"),
]

hiddenimports = [
    "src.gui_app",
    "PySide6.QtCore",
    "PySide6.QtGui",
    "PySide6.QtWidgets",
    "PySide6.QtNetwork",
    "PySide6.QtWebChannel",
    "PySide6.QtWebEngineCore",
    "PySide6.QtWebEngineWidgets",
]
hiddenimports += collect_submodules("playwright")
hiddenimports += collect_submodules("faster_whisper")

# Explicitly exclude large Qt modules that are not used by the GUI. This keeps
# QtWebEngine/QtWidgets intact while avoiding 3D/Charts/QML/Multimedia/PDF/etc.
excludes = [
    "PySide6.Qt3DAnimation",
    "PySide6.Qt3DCore",
    "PySide6.Qt3DExtras",
    "PySide6.Qt3DInput",
    "PySide6.Qt3DLogic",
    "PySide6.Qt3DRender",
    "PySide6.QtCharts",
    "PySide6.QtDataVisualization",
    "PySide6.QtDesigner",
    "PySide6.QtGraphs",
    "PySide6.QtGraphsWidgets",
    "PySide6.QtHelp",
    "PySide6.QtHttpServer",
    "PySide6.QtLocation",
    "PySide6.QtMultimedia",
    "PySide6.QtMultimediaWidgets",
    "PySide6.QtNetworkAuth",
    "PySide6.QtNfc",
    "PySide6.QtPdf",
    "PySide6.QtPdfWidgets",
    "PySide6.QtPositioning",
    "PySide6.QtQuick",
    "PySide6.QtQuick3D",
    "PySide6.QtQuickControls2",
    "PySide6.QtQuickTest",
    "PySide6.QtQuickWidgets",
    "PySide6.QtQml",
    "PySide6.QtRemoteObjects",
    "PySide6.QtScxml",
    "PySide6.QtSensors",
    "PySide6.QtSerialBus",
    "PySide6.QtSerialPort",
    "PySide6.QtSpatialAudio",
    "PySide6.QtSql",
    "PySide6.QtStateMachine",
    "PySide6.QtSvg",
    "PySide6.QtSvgWidgets",
    "PySide6.QtTextToSpeech",
    "PySide6.QtUiTools",
    "PySide6.QtWebEngineQuick",
    "PySide6.QtWebSockets",
    "PySide6.QtWebView",
    "PySide6.QtXml",
    "PySide6.scripts",
    "tests",
]

block_cipher = None


a = Analysis(
    [str(project_dir / "main.py")],
    pathex=[str(project_dir)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name=build_name,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name=build_name,
)

# Keep the project license and notice next to the executable as well as in datas.
# These are explicit public files; private runtime directories remain excluded.
release_dir = Path(DISTPATH) / build_name
for document in ("LICENSE", "NOTICE"):
    shutil.copy2(project_dir / document, release_dir / document)
