from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from app.services.runtime_config import DM_FALLBACK_TEXT, _read_dotenv_values

DOUYIN_DM_REPLY_RELATIVE_PATH = Path('platforms') / 'douyin' / 'dm_reply.json'
LEGACY_DM_REPLY_CONFIG_PATH = Path('dm_reply_config.json')

DEFAULT_DM_REPLY_CONFIG: dict[str, Any] = {
    'enabled': True,
    'fallback_text': DM_FALLBACK_TEXT,
    'identity': '你不是客服话术机，也不要端着。你现在就是账号本人/熟人视角，在抖音私信里根据对方刚发的话自然接话。',
    'style_prompt': '口吻像朋友聊天：自然、松弛、口语化、带一点俏皮，但别油、别夸张、别销售腔。优先短句，像真实人在手机上回消息。',
    'safety_prompt': '只能根据现有对话信息回复；信息不够时就轻轻追问。不要编造价格、库存、发货、功效或任何对话里没有出现的事实。',
    'coze': {
        'enabled': False,
        'api_url': 'https://api.coze.cn/v1/workflow/run',
        'workflow_id': '',
        'token': '',
        'request_timeout_sec': 30.0,
        'input_key': 'input',
        'include_bot_id': False,
        'bot_id': '',
        'app_id': '',
        'extra_parameters': {},
        'ext': {},
    },
}


def _read_json_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merged[key] = _deep_merge(base[key], value)
        else:
            merged[key] = value
    return merged


def _build_search_candidates(data_dir: Path) -> list[Path]:
    explicit = os.getenv('DOUYIN_DM_REPLY_CONFIG_PATH', '').strip()
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit).expanduser())
    normalized_data_dir = data_dir.resolve()
    cwd = Path.cwd().resolve()
    package_root = Path(__file__).resolve().parents[3]
    for base in [normalized_data_dir, cwd, package_root]:
        candidates.append(base / DOUYIN_DM_REPLY_RELATIVE_PATH)
        candidates.append(base / 'data' / DOUYIN_DM_REPLY_RELATIVE_PATH)
        candidates.append(base / LEGACY_DM_REPLY_CONFIG_PATH)
        candidates.append(base / 'data' / LEGACY_DM_REPLY_CONFIG_PATH)
    unique: list[Path] = []
    seen: set[str] = set()
    for path in candidates:
        key = str(path.resolve(strict=False))
        if key in seen:
            continue
        seen.add(key)
        unique.append(path)
    return unique


def _load_first_existing_config(data_dir: Path) -> tuple[dict[str, Any], str]:
    for path in _build_search_candidates(data_dir):
        loaded = _read_json_file(path)
        if loaded:
            return loaded, str(path.resolve())
        if path.exists():
            return {**loaded}, str(path.resolve())
    return {}, ''


def _apply_env_overrides(config: dict[str, Any]) -> dict[str, Any]:
    merged = _deep_merge(DEFAULT_DM_REPLY_CONFIG, config)
    coze_config = dict(merged.get('coze', {}))
    env_mapping = {
        'COZE_API_URL': 'api_url',
        'COZE_WORKFLOW_ID': 'workflow_id',
        'COZE_TOKEN': 'token',
        'COZE_INPUT_KEY': 'input_key',
    }
    dotenv_values = _read_dotenv_values()
    enabled = os.getenv('COZE_ENABLED', dotenv_values.get('COZE_ENABLED', '0'))
    coze_config['enabled'] = enabled.strip().lower() in {'1', 'true', 'yes', 'on'}
    for env_name, config_key in env_mapping.items():
        value = os.getenv(env_name, dotenv_values.get(env_name, '')).strip()
        if value:
            coze_config[config_key] = value
    if coze_config['enabled'] and not (coze_config.get('token') and coze_config.get('workflow_id')):
        coze_config['enabled'] = False
    merged['coze'] = coze_config
    return merged


def load_dm_reply_config(data_dir: Path) -> dict[str, Any]:
    loaded, source_path = _load_first_existing_config(data_dir)
    merged = _apply_env_overrides(loaded)
    meta = dict(merged.get('_meta', {}))
    meta['config_source'] = source_path
    meta['searched_candidates'] = [str(path) for path in _build_search_candidates(data_dir)]
    merged['_meta'] = meta
    return merged


def build_coze_runtime_config(config: dict[str, Any]) -> dict[str, Any]:
    coze = config.get('coze', {}) if isinstance(config.get('coze'), dict) else {}
    return {
        'api_url': coze.get('api_url', ''),
        'workflow_id': coze.get('workflow_id', ''),
        'token': coze.get('token', ''),
        'request_timeout_sec': coze.get('request_timeout_sec', 30.0),
        'input_key': coze.get('input_key', 'input'),
        'include_bot_id': coze.get('include_bot_id', False),
        'bot_id': coze.get('bot_id', ''),
        'app_id': coze.get('app_id', ''),
        'extra_parameters': coze.get('extra_parameters', {}),
        'ext': coze.get('ext', {}),
    }
