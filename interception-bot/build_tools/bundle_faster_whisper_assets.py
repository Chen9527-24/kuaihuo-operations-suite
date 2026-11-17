from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


def _package_assets_dir() -> Path | None:
    try:
        import faster_whisper  # type: ignore
    except Exception as exc:
        print(f"[build] faster_whisper import failed: {exc}", file=sys.stderr)
        return None
    package_root = Path(faster_whisper.__file__).resolve().parent
    assets = package_root / "assets"
    if assets.exists() and assets.is_dir():
        return assets
    return None


def _copy_assets(src: Path, dist: Path) -> Path:
    dst = dist / "_internal" / "faster_whisper" / "assets"
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        target = dst / item.name
        if item.is_dir():
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(item, target)
        elif item.is_file():
            shutil.copy2(item, target)
    return dst


def main() -> int:
    parser = argparse.ArgumentParser(description="Bundle faster-whisper runtime assets into PyInstaller dist.")
    parser.add_argument("--dist", required=True, help="PyInstaller distribution folder")
    args = parser.parse_args()

    dist = Path(args.dist).resolve()
    if not dist.exists():
        print(f"[build] dist folder does not exist: {dist}", file=sys.stderr)
        return 1

    src = _package_assets_dir()
    if src is None:
        print("[build] faster_whisper/assets folder not found.", file=sys.stderr)
        return 1

    dst = _copy_assets(src, dist)
    onnx_files = sorted(dst.glob("*.onnx"))
    if not onnx_files:
        print(f"[build] copied faster-whisper assets but no ONNX files were found in: {dst}", file=sys.stderr)
        return 1

    names = ", ".join(p.name for p in onnx_files)
    print(f"[build] faster-whisper assets copied: {src} -> {dst}")
    print(f"[build] faster-whisper ONNX assets: {names}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
