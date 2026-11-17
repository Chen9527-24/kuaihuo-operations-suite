from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST_ROOT = ROOT / "dist"
PUBLIC_DATA_FILES = ("common.json", "dm.json", "comment.json", "dm_reply.json")
PUBLIC_ENV_KEYS = {
    "CORE_NEXUS_API_BASE_URL", "DM_ACTIVE_SCAN_INTERVAL_MS", "DM_TAB_SCAN_INTERVAL_MS",
    "DM_IDLE_SCAN_MIN_MS", "DM_IDLE_SCAN_MAX_MS", "DM_IDLE_LOG_EVERY_N",
    "DM_IDLE_HEARTBEAT_INTERVAL_MS", "DM_DEBUG_VERBOSE",
}
PRIVATE_KEYS = {
    "token", "password", "accesstoken", "refreshtoken", "access_token", "refresh_token",
    "workflowid", "workflow_id", "userid", "user_id", "bot_id", "app_id", "cookies",
}


def _check_public_config(value: object) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if str(key).lower() in PRIVATE_KEYS and item not in (None, "", [], {}):
                raise ValueError(f"Refusing to bundle private configuration field: {key}")
            _check_public_config(item)
    elif isinstance(value, list):
        for item in value:
            _check_public_config(item)


def _read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def _write_env(path: Path, values: dict[str, str], *, api_base_url: str) -> None:
    merged = {key: value for key, value in values.items() if key in PUBLIC_ENV_KEYS}
    merged["CORE_NEXUS_API_BASE_URL"] = api_base_url.rstrip("/")
    ordered_keys = [
        "CORE_NEXUS_API_BASE_URL",
        "DM_ACTIVE_SCAN_INTERVAL_MS",
        "DM_TAB_SCAN_INTERVAL_MS",
        "DM_IDLE_SCAN_MIN_MS",
        "DM_IDLE_SCAN_MAX_MS",
        "DM_IDLE_LOG_EVERY_N",
        "DM_IDLE_HEARTBEAT_INTERVAL_MS",
        "DM_DEBUG_VERBOSE",
    ]
    lines = [
        "# UCP exe 运行配置。",
        "# CORE_NEXUS_API_BASE_URL 必须填写对应环境 core-nexus 后端的 APP_BASE_URL。",
    ]
    for key in ordered_keys:
        if key in merged:
            lines.append(f"{key}={merged[key]}")
    for key in sorted(k for k in merged.keys() if k not in ordered_keys):
        lines.append(f"{key}={merged[key]}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _copy_runtime_assets(target_dir: Path, env_source: Path, api_base_url: str) -> None:
    for document in ("LICENSE", "NOTICE"):
        if not (ROOT / document).is_file():
            raise FileNotFoundError(f"Required distribution document is missing: {document}")
    values = _read_env(env_source)
    target_dir.mkdir(parents=True, exist_ok=True)
    _write_env(target_dir / ".env", values, api_base_url=api_base_url)

    # Never copy a developer's runtime directories or whole data tree.
    import json
    for name in ("data", "config", "profiles", "logs", "records"):
        destination = target_dir / name
        if destination.exists():
            shutil.rmtree(destination)
    for name in PUBLIC_DATA_FILES:
        source = ROOT / "data" / "platforms" / "douyin" / name
        if not source.is_file():
            raise FileNotFoundError(f"Missing public default: {source.name}")
        value = json.loads(source.read_text(encoding="utf-8"))
        _check_public_config(value)
        destination = target_dir / "data" / "platforms" / "douyin" / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for name in ("config", "profiles", "logs", "records"):
        (target_dir / name).mkdir(parents=True, exist_ok=True)
    for document in ("README.md", "LICENSE", "NOTICE"):
        shutil.copy2(ROOT / document, target_dir / document)
    _write_env(target_dir / ".env.example", values, api_base_url=api_base_url)
    with (target_dir / ".env.example").open("a", encoding="utf-8") as example:
        example.write("\n# Optional legacy cloud path: configure locally after installation.\nCOZE_ENABLED=0\nCOZE_WORKFLOW_ID=\nCOZE_TOKEN=\n")
    (target_dir / "docs").mkdir(exist_ok=True)
    shutil.copy2(ROOT / "docs" / "CONFIGURATION.md", target_dir / "docs" / "CONFIGURATION.md")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build UCP Windows exe by environment.")
    parser.add_argument("--env", choices=["local", "test", "prod"], default="local", help="仅用于产物命名；配置示例统一读取 .env.example。")
    parser.add_argument("--api-base-url", default="", help="Core Nexus 后端地址；为空则读取 env 模板里的 CORE_NEXUS_API_BASE_URL。")
    parser.add_argument("--name", default="", help="exe 名称，默认 UCP-<env>。")
    parser.add_argument("--onefile", action="store_true", help="生成单文件 exe。默认 onedir，更适合保留 .env/config/profiles。")
    args = parser.parse_args()

    env_file = ROOT / ".env.example"
    env_values = _read_env(env_file)
    api_base_url = (args.api_base_url or "http://localhost:3000").rstrip("/")
    app_name = args.name or f"UCP-{args.env}"
    if not app_name or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for char in app_name):
        raise SystemExit("Build name may contain only letters, numbers, hyphens and underscores")

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--windowed",
        "--name",
        app_name,
    ]
    if args.onefile:
        cmd.append("--onefile")
    # 运行期数据使用 exe 旁边目录，不打进临时解包目录；这里只让 PyInstaller 正常分析 Python 包。
    cmd.append(str(ROOT / "run.py"))

    print("[build] running:", " ".join(cmd))
    subprocess.check_call(cmd, cwd=str(ROOT))

    if args.onefile:
        target_dir = DIST_ROOT / app_name
        target_dir.mkdir(parents=True, exist_ok=True)
        exe_name = f"{app_name}.exe" if os.name == "nt" else app_name
        built = DIST_ROOT / exe_name
        if built.exists():
            shutil.move(str(built), str(target_dir / exe_name))
    else:
        target_dir = DIST_ROOT / app_name

    _copy_runtime_assets(target_dir, env_file, api_base_url)
    print(f"[build] done: {target_dir}")
    print(f"[build] api:  {api_base_url}")


if __name__ == "__main__":
    main()
