from __future__ import annotations

import argparse
import os
import shutil
from pathlib import Path


def _candidate_files_from_path(raw: str | None) -> list[Path]:
    if not raw:
        return []
    path = Path(raw.strip().strip('"'))
    if not path.exists():
        return []
    if path.is_file():
        return [path]
    names = [
        'ffmpeg.exe',
        'ffmpeg-win64.exe',
        'ffmpeg',
    ]
    found: list[Path] = []
    for name in names:
        found.extend(path.rglob(name))
    return found


def _playwright_cache_candidates() -> list[Path]:
    candidates: list[Path] = []
    roots: list[Path] = []
    localappdata = os.environ.get('LOCALAPPDATA')
    if localappdata:
        roots.append(Path(localappdata) / 'ms-playwright')
    try:
        import playwright  # type: ignore
        playwright_root = Path(playwright.__file__).resolve().parent
        roots.append(playwright_root / 'driver' / 'package' / '.local-browsers')
    except Exception:
        pass
    for root in roots:
        if not root.exists():
            continue
        for folder in sorted(root.glob('ffmpeg-*'), reverse=True):
            candidates.extend(_candidate_files_from_path(str(folder)))
    return candidates


def _which_candidates() -> list[Path]:
    found: list[Path] = []
    for name in ('ffmpeg', 'ffmpeg.exe'):
        value = shutil.which(name)
        if value:
            p = Path(value)
            if p.exists():
                found.append(p)
    return found


def _pick_ffmpeg() -> Path | None:
    candidates: list[Path] = []
    for env_name in ('ACS_FFMPEG_SOURCE', 'FFMPEG_SOURCE', 'ACS_FFMPEG_PATH'):
        candidates.extend(_candidate_files_from_path(os.environ.get(env_name)))
    candidates.extend(_which_candidates())
    candidates.extend(_playwright_cache_candidates())
    seen: set[str] = set()
    for item in candidates:
        try:
            resolved = str(item.resolve()).lower()
        except Exception:
            resolved = str(item).lower()
        if resolved in seen:
            continue
        seen.add(resolved)
        if item.exists() and item.is_file():
            return item
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description='Bundle ffmpeg into release dist directory.')
    parser.add_argument('--dist', required=True)
    parser.add_argument('--required', action='store_true')
    args = parser.parse_args()

    dist = Path(args.dist).resolve()
    dist.mkdir(parents=True, exist_ok=True)
    marker = dist / '.bundled_ffmpeg_path'
    if marker.exists():
        marker.unlink()

    ffmpeg = _pick_ffmpeg()
    if not ffmpeg:
        msg = (
            '[build] ffmpeg not found. Provide one of: ACS_FFMPEG_SOURCE, FFMPEG_SOURCE, '
            'ACS_FFMPEG_PATH, PATH ffmpeg, or Playwright cache %LOCALAPPDATA%\\ms-playwright\\ffmpeg-*.'
        )
        print(msg)
        return 1 if args.required else 0

    target_dir = dist / 'bin' / 'ffmpeg'
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / ('ffmpeg.exe' if os.name == 'nt' else 'ffmpeg')
    shutil.copy2(ffmpeg, target)

    # Bundle ffprobe only when available next to the selected ffmpeg. Playwright's
    # ffmpeg cache usually does not include ffprobe; runtime already falls back to
    # ffmpeg-based probing when ffprobe is absent.
    for probe_name in ('ffprobe.exe', 'ffprobe'):
        probe = ffmpeg.with_name(probe_name)
        if probe.exists() and probe.is_file():
            shutil.copy2(probe, target_dir / probe_name)
            break

    rel = target.relative_to(dist).as_posix()
    marker.write_text(rel, encoding='utf-8')
    print(f'[build] bundled ffmpeg: {ffmpeg} -> {target}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
