from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
from pathlib import Path


def _repo_for_model(model: str) -> str:
    value = (model or "small").strip() or "small"
    if "/" in value and not any(sep in value for sep in ("\\", ":")):
        return value
    return f"Systran/faster-whisper-{value}"


def _safe_dir_name(model: str) -> str:
    value = (model or "small").strip() or "small"
    if any(sep in value for sep in ("/", "\\", ":")):
        value = value.replace("/", "_").replace("\\", "_").replace(":", "_")
    if not value.startswith("faster-whisper-") and not value.startswith("Systran_"):
        value = f"faster-whisper-{value}"
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value)


def _hf_cache_root() -> Path:
    if os.getenv("HF_HUB_CACHE"):
        return Path(os.environ["HF_HUB_CACHE"]).expanduser()
    hf_home = Path(os.getenv("HF_HOME", str(Path.home() / ".cache" / "huggingface"))).expanduser()
    return hf_home / "hub"


def _is_valid_model_dir(path: Path) -> bool:
    if not path.is_dir():
        return False
    # faster-whisper/CTranslate2 model directory normally contains these files.
    # Some snapshots may use slightly different tokenizer file names, so model.bin
    # is the hard requirement and config/tokenizer files are validated loosely.
    if not (path / "model.bin").exists():
        return False
    has_config = (path / "config.json").exists()
    has_tokenizer = any((path / name).exists() for name in ("tokenizer.json", "vocabulary.txt"))
    return has_config and has_tokenizer


def _latest_snapshot(repo: str) -> Path | None:
    cache_root = _hf_cache_root()
    repo_cache = cache_root / ("models--" + repo.replace("/", "--"))
    snapshots = repo_cache / "snapshots"
    if not snapshots.exists():
        return None
    candidates = [p for p in snapshots.iterdir() if _is_valid_model_dir(p)]
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def _copy_model(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    # symlinks=False is deliberate: HuggingFace snapshots can contain symlinks to
    # blobs; the formal release must contain real files and work on another PC.
    shutil.copytree(src, dst, symlinks=False)


def main() -> int:
    parser = argparse.ArgumentParser(description="Bundle local faster-whisper model into release dist.")
    parser.add_argument("--dist", required=True, help="Release dist directory, e.g. dist/authorized-content-sync-prod")
    parser.add_argument("--model", default=os.getenv("WHISPER_MODEL", ""), help="Model name/repo/local path. Default: WHISPER_MODEL; no implicit model")
    parser.add_argument("--required", action="store_true", help="Exit non-zero when local model cache is missing")
    args = parser.parse_args()

    dist = Path(args.dist).resolve()
    model = (args.model or "").strip()
    explicit_source = os.getenv("WHISPER_MODEL_SOURCE", "").strip()
    if not model and not explicit_source:
        print("[build] Configure WHISPER_MODEL or WHISPER_MODEL_SOURCE to bundle a local model.")
        return 2 if args.required else 0
    if not model:
        model = explicit_source

    src: Path | None = None
    if explicit_source:
        candidate = Path(explicit_source).expanduser().resolve()
        if _is_valid_model_dir(candidate):
            src = candidate
        else:
            print(f"[build] invalid WHISPER_MODEL_SOURCE: {candidate}", file=sys.stderr)
    elif Path(model).expanduser().exists():
        candidate = Path(model).expanduser().resolve()
        if _is_valid_model_dir(candidate):
            src = candidate
        else:
            print(f"[build] WHISPER_MODEL path exists but is not a valid faster-whisper model: {candidate}", file=sys.stderr)
    else:
        repo = _repo_for_model(model)
        src = _latest_snapshot(repo)

    if src is None:
        repo = _repo_for_model(model)
        msg = (
            f"[build] local faster-whisper model not found. model={model} repo={repo}\n"
            f"[build] Checked HuggingFace cache: {_hf_cache_root()}\n"
            "[build] Formal packages must bundle this model to avoid runtime HuggingFace downloads.\n"
            "[build] Run speech analysis once on this build machine, or set WHISPER_MODEL_SOURCE to a local model folder."
        )
        print(msg, file=sys.stderr)
        return 2 if args.required else 0

    target_name = _safe_dir_name(model)
    dst = dist / "models" / target_name
    print(f"[build] bundle faster-whisper model source : {src}")
    print(f"[build] bundle faster-whisper model target : {dst}")
    _copy_model(src, dst)
    if not _is_valid_model_dir(dst):
        print(f"[build] copied model is invalid: {dst}", file=sys.stderr)
        return 3

    env_file = dist / ".bundled_whisper_model"
    env_file.write_text(f"models/{target_name}\n", encoding="utf-8")
    print(f"[build] bundled whisper model env value: models/{target_name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
