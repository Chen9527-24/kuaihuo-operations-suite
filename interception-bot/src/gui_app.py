from __future__ import annotations

import base64
import csv
import hashlib
import json
import os
import re
import shutil
import socket
import sqlite3
import sys
import tempfile
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .runtime_env import apply_runtime_defaults, runtime_env_for_child, is_frozen_app
from .intercept_recovery import request_intercept_stop

apply_runtime_defaults()

def _bool_env(name: str, default: str = "0") -> bool:
    value = os.environ.get(name, default).strip().lower()
    return value in {"1", "true", "yes", "on"}


def _find_free_local_port() -> int:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])
    finally:
        try:
            sock.close()
        except Exception:
            pass


def _safe_runtime_key(*values: object, fallback: str = "robot") -> str:
    raw = next((str(value).strip() for value in values if str(value or "").strip()), fallback)
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", raw).strip("_")
    safe = safe[:56] if safe else fallback
    digest = hashlib.sha1(raw.encode("utf-8", errors="ignore")).hexdigest()[:10]
    if digest and digest not in safe:
        safe = f"{safe}_{digest}"
    return safe or f"{fallback}_{digest}"


def _normalize_robot_name_key(value: object) -> str:
    text = str(value or "").strip().lower()
    return re.sub(r"\s+", "", text)


def _login_identity_key(platform: object, robot_id: object, robot_name: object, *, fallback: str = "robot") -> str:
    """Return the shared login identity key used by GUI browser profiles.

    Login state is intentionally keyed by platform + robot display name.
    Interception robots and private-message robots with the same name can reuse
    the same platform login state; different names must get different browser
    profiles and therefore must scan/login independently.  Do not pass multiple
    values directly to _safe_runtime_key here: that helper intentionally picks
    the first non-empty value, which would collapse every Douyin robot into one
    shared profile.
    """
    platform_key = str(platform or "douyin").strip().lower() or "douyin"
    name_key = _normalize_robot_name_key(robot_name)
    if name_key:
        raw = f"{platform_key}__name__{name_key}"
    else:
        raw = f"{platform_key}__robot__{str(robot_id or '').strip() or fallback}"
    return _safe_runtime_key(raw, fallback=fallback)


# 主动私信默认使用“截流同款 Playwright 持久化 profile”执行。
# Qt WebEngine 的 CDP 与 Playwright connect_over_cdp 并不完全兼容，当前默认不启用。
# 如需继续实验 CDP 接管右侧工作区，可在启动 GUI 前显式设置 ACS_PM_CDP_ENABLED=1。
if os.environ.get("QTWEBENGINE_REMOTE_DEBUGGING") is None and _bool_env("ACS_PM_CDP_ENABLED", "0"):
    _qt_cdp_port = os.environ.get("ACS_QTWEBENGINE_CDP_PORT", "").strip()
    if not _qt_cdp_port:
        try:
            _qt_cdp_port = str(_find_free_local_port())
        except Exception:
            _qt_cdp_port = "9223"
    os.environ["ACS_QTWEBENGINE_CDP_PORT"] = _qt_cdp_port
    os.environ["ACS_QTWEBENGINE_CDP_URL"] = f"http://127.0.0.1:{_qt_cdp_port}"
    os.environ["QTWEBENGINE_REMOTE_DEBUGGING"] = f"127.0.0.1:{_qt_cdp_port}"
elif os.environ.get("QTWEBENGINE_REMOTE_DEBUGGING") and not os.environ.get("ACS_QTWEBENGINE_CDP_URL"):
    _raw_cdp = os.environ.get("QTWEBENGINE_REMOTE_DEBUGGING", "").strip()
    if _raw_cdp.isdigit():
        os.environ["ACS_QTWEBENGINE_CDP_PORT"] = _raw_cdp
        os.environ["ACS_QTWEBENGINE_CDP_URL"] = f"http://127.0.0.1:{_raw_cdp}"
    elif _raw_cdp:
        
        if _raw_cdp.startswith(("http://", "https://")):
            os.environ["ACS_QTWEBENGINE_CDP_URL"] = _raw_cdp
        else:
            os.environ["ACS_QTWEBENGINE_CDP_URL"] = "http://" + _raw_cdp

# Qt WebEngine 使用内置 Chromium，部分平台页会自动播放视频。右侧工作区只用于登录和可视化状态，
# 不依赖视频播放；提前限制自动播放和音频可减少“音频/视频格式不支持”黑屏提示。
_existing_qt_flags = os.environ.get("QTWEBENGINE_CHROMIUM_FLAGS", "").strip()
_extra_qt_flags = "--autoplay-policy=user-gesture-required --mute-audio --disable-features=HardwareMediaKeyHandling"
if _existing_qt_flags:
    for _flag in _extra_qt_flags.split():
        if _flag not in _existing_qt_flags:
            _existing_qt_flags += " " + _flag
    os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = _existing_qt_flags
else:
    os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = _extra_qt_flags

from PySide6.QtCore import QPoint, QProcess, QProcessEnvironment, QTimer, QUrl, QSize, Qt, Signal
from PySide6.QtGui import QColor, QFont, QPainter, QPen, QTextCursor
try:
    from PySide6.QtTest import QTest
except Exception:
    QTest = None  # type: ignore
try:
    from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile, QWebEngineSettings, QWebEngineScript
    from PySide6.QtWebEngineWidgets import QWebEngineView
    WEB_ENGINE_AVAILABLE = True
except Exception:
    QWebEnginePage = None  # type: ignore
    QWebEngineProfile = None  # type: ignore
    QWebEngineSettings = None  # type: ignore
    QWebEngineScript = None  # type: ignore
    QWebEngineView = None  # type: ignore
    WEB_ENGINE_AVAILABLE = False

from PySide6.QtWidgets import (
    QApplication,
    QButtonGroup,
    QCheckBox,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFileDialog,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QPlainTextEdit,
    QMenu,
    QSizePolicy,
    QSplitter,
    QStackedWidget,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QTextEdit,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from .core_nexus_client import CoreNexusClient, CoreNexusSession, load_session, save_session
from .robot_config import normalize_robot_detail
from .storage import output_account_dir


PLATFORMS: list[tuple[str, str]] = [
    ("douyin", "抖音"),
    ("kuaishou", "快手"),
    ("xiaohongshu", "小红书"),
    ("tiktok", "TikTok"),
]
PLATFORM_LABEL = dict(PLATFORMS)
STATUS_LABEL = {
    "DRAFT": "草稿",
    "READY": "待命",
    "RUNNING": "运行中",
    "STOPPING": "停止中",
    "STOPPED": "已停止",
    "DISABLED": "已禁用",
    "ERROR": "异常",
    "EXPIRED": "已过期",
}
AUTH_STATUS_LABEL = {
    "UNBOUND": "未绑定",
    "WAIT_QR": "待扫码",
    "SCANNING": "扫码中",
    "AUTHORIZED": "已授权",
    "AUTH_EXPIRED": "授权过期",
    "REVOKED": "已撤销",
    "AUTH_FAILED": "授权失败",
}


WEBVIEW_MEDIA_GUARD_JS = r"""
(function () {
  if (window.__INTERCEPTION_WEBVIEW_MEDIA_GUARD__) return;
  window.__INTERCEPTION_WEBVIEW_MEDIA_GUARD__ = true;

  function ensureStyle() {
    try {
      if (document.getElementById('__interception_media_guard_style__')) return;
      var style = document.createElement('style');
      style.id = '__interception_media_guard_style__';
      style.textContent = [
        'video,audio{filter:brightness(0.95)!important}',
        '.xgplayer-error,.xgplayer-error-text,.xgplayer-prompt,.xgplayer-tips{display:none!important}',
        '[class*=\"error\" i][class*=\"player\" i]{display:none!important}',
        '[class*=\"unsupported\" i]{display:none!important}'
      ].join('\n');
      (document.head || document.documentElement).appendChild(style);
    } catch (e) {}
  }

  function quietMedia() {
    try {
      ensureStyle();
      document.querySelectorAll('video,audio').forEach(function (el) {
        try {
          el.muted = true;
          el.defaultMuted = true;
          el.volume = 0;
          el.autoplay = false;
          el.removeAttribute('autoplay');
        } catch (e) {}
      });
      document.querySelectorAll('button,[role=button],div,span,p').forEach(function (el) {
        try {
          var text = (el.innerText || el.textContent || '').trim();
          if (!text || text.length > 90) return;
          if (text.indexOf('不支持的音频/视频格式') >= 0 ||
              text.indexOf('设备网络') >= 0 ||
              text.indexOf('因浏览器限制') >= 0 ||
              text.indexOf('打开声音') >= 0) {
            el.style.display = 'none';
            el.style.visibility = 'hidden';
          }
        } catch (e) {}
      });
    } catch (e) {}
  }

  function install() {
    quietMedia();
    try {
      var observer = new MutationObserver(function () { quietMedia(); });
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    } catch (e) {}
    setInterval(quietMedia, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }

})();
"""

GUI_DOM_EXTRACT_JS = r"""
(() => {
  const idRe = /^\d{15,25}$/;
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const toAbs = (href) => {
    try { return new URL(String(href || ''), location.href).href; } catch (e) { return String(href || ''); }
  };
  const idFromHref = (href) => {
    href = String(href || '');
    const patterns = [
      /\/video\/(\d{15,25})/,
      /[?&](?:modal_id|vid|video_id|aweme_id|item_id|itemId)=(\d{15,25})/,
    ];
    for (const re of patterns) {
      const m = href.match(re);
      if (m && idRe.test(m[1])) return m[1];
    }
    return '';
  };
  const parseNumericCount = (text) => {
    const token = norm(text).replace(/,/g, '');
    if (!token) return null;
    const m = token.match(/([0-9]+(?:\.[0-9]+)?)(\s*(?:万|w|W|k|K))?/);
    if (!m) return null;
    const base = parseFloat(m[1]);
    if (!Number.isFinite(base)) return null;
    const suffix = m[2] || '';
    const mul = /万|w|W/.test(suffix) ? 10000 : (/k|K/.test(suffix) ? 1000 : 1);
    const value = Math.round(base * mul);
    return value >= 0 && value <= 1000000 ? value : null;
  };
  const profileCount = (() => {
    const direct = ['#semiTabpost [data-e2e="user-tab-count"]', '[role="tab"][aria-selected="true"] [data-e2e="user-tab-count"]', '[data-e2e="user-tab-count"]'];
    for (const sel of direct) {
      for (const el of Array.from(document.querySelectorAll(sel)).slice(0, 8)) {
        const value = parseNumericCount(el.innerText || el.textContent || '');
        if (value !== null) return value;
      }
    }
    return null;
  })();
  const extractCaption = (anchor, card) => {
    for (const node of [anchor, card].filter(Boolean)) {
      const img = node.querySelector && node.querySelector('img[alt]');
      if (img) {
        let alt = norm(img.getAttribute('alt'));
        alt = alt.replace(/^[^：:]{1,40}[：:]\s*/, '');
        if (alt) return alt.slice(0, 260);
      }
    }
    const text = norm((card && (card.innerText || card.textContent)) || (anchor && (anchor.innerText || anchor.textContent)) || '');
    return text.replace(/^[0-9.]+\s*(?:万|w|W|k|K)?\s*/, '').slice(0, 260);
  };
  const extractTimeText = (card) => {
    if (!card || !card.querySelectorAll) return '';
    for (const n of Array.from(card.querySelectorAll('time, [datetime], [title], span, div')).slice(0, 100)) {
      const value = norm(n.getAttribute('datetime') || n.getAttribute('title') || n.innerText || n.textContent || '');
      if (/刚刚|昨天|前天|分钟前|小时前|天前|周前|月前|\d{4}[年\-/]\d{1,2}|\d{1,2}[\-/]\d{1,2}/.test(value)) return value;
    }
    return '';
  };
  const items = [];
  const seen = new Set();
  const pushAnchor = (anchor, source, containerIndex) => {
    const hrefRaw = anchor && (anchor.getAttribute('href') || anchor.href || '');
    const href = toAbs(hrefRaw);
    const id = idFromHref(hrefRaw) || idFromHref(href);
    if (!id || !idRe.test(id) || seen.has(id)) return;
    seen.add(id);
    const card = (anchor.closest && (anchor.closest('[data-e2e="user-post-list"] li') || anchor.closest('li') || anchor.closest('article'))) || anchor.parentElement || anchor;
    items.push({
      href: href || `https://www.douyin.com/video/${id}`,
      video_id: id,
      caption: extractCaption(anchor, card),
      text: extractCaption(anchor, card),
      time_text: extractTimeText(card),
      source,
      container_index: containerIndex,
    });
  };
  const strong = Array.from(document.querySelectorAll('[data-e2e="user-post-list"]'));
  strong.forEach((container, idx) => {
    Array.from(container.querySelectorAll('a[href*="/video/"], a[href*="modal_id="], a[href*="aweme_id="], a[href*="item_id="]')).forEach(a => pushAnchor(a, 'gui_workspace_user_post_list', idx));
  });
  let source = strong.length ? 'gui_workspace_user_post_list' : 'none';
  if (!items.length) {
    const scopedRoots = Array.from(document.querySelectorAll('#user-tabbar, #user-tabbar-2, [data-e2e="user-work-tab"], #semiTabPanelpost, #semiTabPanelvideo, [aria-labelledby="semiTabpost"], [aria-labelledby="semiTabvideo"], main, [role="main"]')).slice(0, 20);
    scopedRoots.forEach((root, idx) => {
      Array.from(root.querySelectorAll('[data-e2e="scroll-list"] a[href*="/video/"], ul a[href*="/video/"], a[href*="modal_id="]')).forEach(a => pushAnchor(a, 'gui_workspace_profile_scoped_list', idx));
    });
    if (items.length) source = 'gui_workspace_profile_scoped_list';
  }
  const secUidFromUrl = () => {
    try {
      const url = new URL(location.href);
      const fromQuery = url.searchParams.get('sec_uid') || url.searchParams.get('sec_user_id') || url.searchParams.get('sec_userid') || '';
      if (fromQuery) return fromQuery;
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[0] === 'user') return decodeURIComponent(parts[1] || '');
    } catch (e) {}
    return '';
  };
  const findAwemeList = (obj, depth = 0) => {
    if (!obj || depth > 8) return null;
    if (Array.isArray(obj)) {
      for (const item of obj.slice(0, 12)) {
        const hit = findAwemeList(item, depth + 1);
        if (hit) return hit;
      }
      return null;
    }
    if (typeof obj === 'object') {
      if (Array.isArray(obj.aweme_list) && obj.aweme_list.some(x => x && typeof x === 'object')) return obj.aweme_list;
      for (const value of Object.values(obj)) {
        const hit = findAwemeList(value, depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  const awemeIdOf = (aweme) => {
    if (!aweme || typeof aweme !== 'object') return '';
    for (const key of ['aweme_id', 'awemeId', 'aweme_id_str', 'awemeIdStr', 'id', 'item_id', 'itemId']) {
      const value = String(aweme[key] || '').trim();
      if (idRe.test(value)) return value;
    }
    return '';
  };
  const apiFallbackItems = () => {
    const secUid = secUidFromUrl();
    if (!secUid) return { ok: false, reason: 'missing_sec_uid', items: [] };
    const readCookie = (name) => {
      const prefix = `${name}=`;
      const hit = String(document.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(prefix));
      return hit ? decodeURIComponent(hit.slice(prefix.length)) : '';
    };
    const nav = window.navigator || {};
    const screenInfo = window.screen || {};
    const params = new URLSearchParams({
      device_platform: 'webapp',
      aid: '6383',
      channel: 'channel_pc_web',
      sec_user_id: secUid,
      max_cursor: '0',
      locate_query: 'false',
      show_live_replay_strategy: '1',
      need_time_list: '1',
      time_list_query: '0',
      count: '50',
      publish_video_strategy_type: '2',
      pc_client_type: '1',
      version_code: '170400',
      version_name: '17.4.0',
      cookie_enabled: String(nav.cookieEnabled !== false),
      screen_width: String(screenInfo.width || 1440),
      screen_height: String(screenInfo.height || 1080),
      browser_language: nav.language || 'zh-CN',
      browser_platform: nav.platform || 'Win32',
      browser_name: 'Chrome',
      browser_online: String(nav.onLine !== false),
      engine_name: 'Blink',
      os_name: 'Windows',
      cpu_core_num: String(nav.hardwareConcurrency || 8),
      device_memory: String(nav.deviceMemory || 8),
      platform: 'PC',
      downlink: '10',
      effective_type: '4g',
      round_trip_time: '50',
    });
    const msToken = readCookie('msToken');
    if (msToken) params.set('msToken', msToken);
    const apiUrl = `${location.origin || 'https://www.douyin.com'}/aweme/v1/web/aweme/post/?${params.toString()}`;
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', apiUrl, false);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
      xhr.send(null);
      if (xhr.status < 200 || xhr.status >= 300) return { ok: false, reason: `api_http_${xhr.status}`, url: apiUrl, items: [] };
      const payload = JSON.parse(xhr.responseText || '{}');
      const list = findAwemeList(payload) || [];
      const mapped = [];
      for (const aweme of list) {
        const id = awemeIdOf(aweme);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        mapped.push({
          href: `https://www.douyin.com/video/${id}`,
          video_id: id,
          caption: norm(aweme.desc || aweme.caption || ''),
          text: norm(aweme.desc || aweme.caption || ''),
          time_text: String(aweme.create_time || aweme.createTime || aweme.create_timestamp || ''),
          publish_time_raw: String(aweme.create_time || aweme.createTime || aweme.create_timestamp || ''),
          source: 'gui_workspace_post_api',
          container_index: 0,
        });
      }
      return {
        ok: mapped.length > 0,
        reason: mapped.length > 0 ? 'api_ok' : 'api_empty_or_rejected',
        url: apiUrl,
        status_code: payload && payload.status_code,
        status_msg: payload && payload.status_msg,
        aweme_count: list.length,
        items: mapped,
      };
    } catch (e) {
      return { ok: false, reason: `api_fetch_failed: ${e && e.message || e}`, url: apiUrl, items: [] };
    }
  };
  let apiFallback = null;
  if (!items.length) {
    apiFallback = apiFallbackItems();
    if (apiFallback && Array.isArray(apiFallback.items) && apiFallback.items.length) {
      apiFallback.items.forEach(item => items.push(item));
      source = 'gui_workspace_post_api';
    }
  }
  const capped = profileCount && profileCount > 0 ? items.slice(0, profileCount) : items;
  const debug = {
    url: location.href,
    title: document.title || '',
    ready_state: document.readyState,
    strong_container_count: strong.length,
    user_post_list_href_count: Array.from(document.querySelectorAll('[data-e2e="user-post-list"] a[href*="/video/"]')).length,
    video_href_count: Array.from(document.querySelectorAll('a[href*="/video/"]')).length,
    body_text_len: (document.body && (document.body.innerText || document.body.textContent || '').length) || 0,
    api_fallback: apiFallback,
  };
  return { ok: capped.length > 0, reason: capped.length > 0 ? 'ok' : 'no_profile_dom_items', source, profile_count: profileCount, items: capped, debug };
})()
"""

GUI_DOM_SCROLL_JS = r"""
(() => {
  const used = [];
  const push = (el, label) => {
    if (!el) return;
    try {
      const before = el.scrollTop || 0;
      el.scrollTop = before + 1200;
      el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 1200 }));
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
      used.push({ label, before, after: el.scrollTop || 0, scrollHeight: el.scrollHeight || 0, clientHeight: el.clientHeight || 0 });
    } catch (e) {}
  };
  push(document.querySelector('[data-e2e="user-post-list"]'), 'user-post-list');
  push(document.querySelector('[data-e2e="scroll-list"]'), 'scroll-list');
  push(document.scrollingElement || document.documentElement || document.body, 'document');
  for (const el of Array.from(document.querySelectorAll('main, [role="main"], [data-e2e], div, section')).slice(0, 800)) {
    try {
      const style = getComputedStyle(el);
      const canScroll = (el.scrollHeight || 0) - (el.clientHeight || 0) > 80;
      if (canScroll || /auto|scroll|overlay/i.test(`${style.overflow} ${style.overflowY}`)) push(el, (el.getAttribute('data-e2e') || el.id || el.className || el.tagName || 'node').toString().slice(0, 80));
    } catch (e) {}
    if (used.length >= 10) break;
  }
  try { window.scrollBy(0, 1200); window.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 1200 })); window.dispatchEvent(new Event('scroll', { bubbles: true })); } catch (e) {}
  return { ok: true, used };
})()
"""

RUNTIME_BADGE_COLORS = {
    "READY": "#0F766E",
    "RUNNING": "#2563EB",
    "STOPPING": "#F97316",
    "STOPPED": "#64748B",
    "DRAFT": "#64748B",
    "DISABLED": "#475569",
    "EXPIRED": "#B91C1C",
    "ERROR": "#DC2626",
}
JSON_PATH_RE = re.compile(r"JSON:\s*(.+)$")
SUMMARY_PATH_RE = re.compile(r"summary:\s*(.+)$", re.IGNORECASE)
TARGET_EVENT_PREFIX = "[TARGET]"
RUNTIME_BROWSER_SELECTED_PREFIX = "[RUNTIME_BROWSER_SELECTED]"
GUI_DOM_REQUEST_PREFIX = "[GUI_DOM_REQUEST]"
GUI_CONTENT_REQUEST_PREFIX = "[GUI_CONTENT_REQUEST]"
GUI_PRIVATE_MESSAGE_REQUEST_PREFIX = "[GUI_PM_REQUEST]"


@dataclass
class WebviewWorkspace:
    key: str
    platform: str
    view: Any
    page: Any
    profile: Any
    cookie_cache: dict[str, dict[str, dict[str, Any]]]
    last_url: str = ""
    last_load_at: float = 0.0
    media_guard_script_installed: bool = False


PLATFORM_AUTH_COOKIE_NAMES = {
    # 只放真正代表账号已登录的强登录 Cookie。
    # odin_tt / passport_auth_mix_state 等在未登录页面也可能存在，不能作为启动采集/私信的依据；
    # 否则会出现“GUI 认为已登录，但 Playwright 页面实际弹出登录框”的问题。
    "douyin": {
        "sessionid", "sessionid_ss", "sid_guard", "sid_tt", "uid_tt", "uid_tt_ss",
        "passport_auth_status", "passport_auth_status_ss", "sid_ucp_v1", "ssid_ucp_v1",
        "n_mh",
    },
    "kuaishou": {"kuaishou.api_st", "kuaishou.server.web_st", "did", "clientid"},
    "xiaohongshu": {"web_session", "webId", "a1"},
    "tiktok": {"sessionid", "sid_guard", "sid_tt", "uid_tt"},
}
PLATFORM_DOMAIN_HINTS = {
    "douyin": "douyin.com",
    "kuaishou": "kuaishou.com",
    "xiaohongshu": "xiaohongshu.com",
    "tiktok": "tiktok.com",
}

APP_QSS = """
QWidget {
    background: #EEF3F8;
    color: #142033;
    font-size: 14px;
    font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
}
QLabel, QCheckBox { background: transparent; }
QMainWindow::separator { width: 1px; height: 1px; background: #E2E8F0; }
QFrame#TopBar,
QFrame#RobotListPanel,
QFrame#RightPanel,
QFrame#PreviewCanvas,
QFrame#LoginCard,
QDialog#LogDialog,
QDialog#SettingsDialog,
QFrame#TenantOptionCard {
    background: #FFFFFF;
    border: 1px solid #E5ECF5;
    border-radius: 20px;
}
QLabel#TopBarLogo,
QLabel#BrandLogo {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #0F172A, stop:0.65 #1D4ED8, stop:1 #7C3AED);
    color: white;
    font-weight: 900;
    qproperty-alignment: AlignCenter;
}
QLabel#TopBarLogo {
    border-radius: 22px;
    min-width: 46px; max-width: 46px; min-height: 46px; max-height: 46px;
    font-size: 16px;
}
QLabel#BrandLogo {
    border-radius: 24px;
    min-width: 72px; max-width: 72px; min-height: 72px; max-height: 72px;
    font-size: 24px;
}
QPushButton#TopPlatformButton,
QPushButton#InlineFilterButton {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 14px;
    color: #475569;
    padding: 9px 14px;
    font-size: 13px;
    font-weight: 800;
}
QPushButton#TopPlatformButton:checked,
QPushButton#InlineFilterButton:checked {
    background: #16213A;
    color: #FFFFFF;
    border: 1px solid #16213A;
}
QPushButton#TopPlatformButton:hover,
QPushButton#InlineFilterButton:hover { border: 1px solid #93A6BE; }
QPushButton {
    background: #111827;
    color: white;
    border-radius: 10px;
    padding: 8px 12px;
    border: none;
    font-weight: 800;
}
QPushButton:hover { background: #1F2937; }
QPushButton:disabled { background: #D1D5DB; color: #F9FAFB; }
QPushButton#LoginPrimaryButton {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #2563EB, stop:1 #4338CA);
    border-radius: 12px;
    min-height: 42px;
}
QPushButton#LoginPrimaryButton:hover { background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #1D4ED8, stop:1 #3730A3); }
QPushButton#CardStartButton {
    background: #0FA37F; border: 1px solid #078567; border-radius: 9px;
    min-width: 84px; max-width: 84px; min-height: 36px; max-height: 36px;
    padding: 0px; font-size: 13px; font-weight: 900;
}
QPushButton#CardStartButton:hover { background: #0B8D70; }
QPushButton#CardStartButton:disabled { background: #CBD5E1; border: 1px solid #CBD5E1; color: #F8FAFC; }
QPushButton#CardStopButton {
    background: #FFFFFF; color: #5E6E85; border: 1px solid #D5DFEC; border-radius: 9px;
    min-width: 76px; max-width: 76px; min-height: 36px; max-height: 36px;
    padding: 0px; font-size: 13px; font-weight: 900;
}
QPushButton#CardStopButton:hover { background: #F8FAFC; border: 1px solid #AAB9CB; }
QPushButton#CardStopButton:disabled { background: #F8FAFC; color: #64748B; border: 1px solid #D5DFEC; }
QToolButton#CardMoreButton {
    background: #FFFFFF; color: #10213D; border: 1px solid #D5DFEC; border-radius: 9px;
    min-width: 36px; max-width: 36px; min-height: 36px; max-height: 36px;
    padding: 0px 0px 2px 0px; font-size: 17px; font-weight: 900;
}
QToolButton#CardMoreButton:hover { background: #F1F5F9; border: 1px solid #AAB9CB; }
QToolButton#CardMoreButton::menu-indicator { image: none; width: 0px; }
QToolButton#CardLogButton {
    background: transparent; border: none; min-width: 22px; max-width: 22px;
    min-height: 22px; max-height: 22px; padding: 0px;
}
QToolButton#CardLogButton:hover { background: #EAF3FF; border-radius: 7px; }
QPushButton#GhostButton, QToolButton#PasswordToggle {
    background: #F8FAFC;
    color: #0F172A;
    border: 1px solid #E2E8F0;
}
QPushButton#GhostButton:hover, QToolButton#PasswordToggle:hover { background: #F1F5F9; }
QLabel#TopPageTitle, QLabel#SectionTitle {
    font-size: 17px;
    font-weight: 900;
    color: #0F172A;
}
QLabel#LoginTitle {
    color: #0F172A;
    font-size: 28px;
    font-weight: 900;
}
QLabel#TopStatusHint,
QLabel#RobotMeta,
QLabel#LoginSubtitle,
QLabel#FieldHint,
QLabel#PreviewPlaceholder {
    color: #64748B;
    font-size: 12px;
    font-weight: 600;
}
QLabel#PreviewPlaceholder {
    font-size: 15px;
    padding: 28px;
    line-height: 1.7;
}
QLabel#RobotListTitle {
    color: #10213D; font-size: 20px; font-weight: 900;
}
QLabel#RobotListCount {
    color: #52627B; font-size: 13px; font-weight: 700;
    min-width: 34px;
}
QPushButton#RobotRefreshButton {
    background: #FFFFFF; color: #10213D; border: 1px solid #D5DFEC; border-radius: 10px;
    min-width: 64px; max-width: 64px; min-height: 36px; max-height: 36px;
    padding: 0px; font-size: 13px; font-weight: 900;
}
QPushButton#RobotRefreshButton:hover { background: #F8FAFC; border: 1px solid #AAB9CB; }
QPushButton#RobotTypeTab {
    background: #FFFFFF; color: #53627A; border: 1px solid #D5DFEC; border-radius: 12px;
    min-width: 66px; max-width: 66px; min-height: 36px; max-height: 36px;
    padding: 0px; font-size: 14px; font-weight: 900;
}
QPushButton#RobotTypeTab:checked {
    background: #0E2E62; color: #FFFFFF; border: 1px solid #0E2E62;
}
QPushButton#RobotTypeTab:hover { border: 1px solid #93A6BE; }
QLabel#RobotName {
    color: #10213D; font-size: 16px; font-weight: 900;
}
QLabel#RobotTypeLabel {
    color: #64748B; font-size: 12px; font-weight: 700;
}
QLabel#CardMetaText {
    color: #43516A; font-size: 12px; font-weight: 800;
}
QFrame#RobotCard {
    background: #FFFFFF; border: 1px solid #D9E4F0; border-radius: 14px;
}
QFrame#RobotCard:hover { border: 1px solid #9CB0C8; background: #FFFFFF; }
QFrame#RobotCard[selected="true"] { background: #FBFDFF; border: 1px solid #93C5FD; }
QFrame#RobotMetaPanel {
    background: #F8FBFF; border: 1px solid #DCE8F7; border-radius: 10px;
}
QFrame#CardDivider {
    background: #E5ECF5; border: none; min-height: 1px; max-height: 1px;
}
QListWidget#RobotListWidget {
    background: transparent;
    border: none;
    outline: none;
}
QListWidget#RobotListWidget::item { margin: 0px; border-radius: 20px; }
QListWidget#RobotListWidget::item:selected { background: transparent; }
QLineEdit, QComboBox, QPlainTextEdit, QTextEdit, QTableWidget {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    padding: 9px 12px;
    selection-background-color: #BFDBFE;
}
QLineEdit:focus, QComboBox:focus, QPlainTextEdit:focus, QTextEdit:focus { border: 1px solid #3B82F6; background: #FFFFFF; }
QLineEdit#LoginInput { padding: 12px 14px; }
QTextEdit#RequestDetail, QPlainTextEdit#LogView {
    font-family: Consolas, Menlo, monospace;
    font-size: 12px;
}
QPlainTextEdit#LogView, QTextEdit#RequestDetail {
    background: #0F172A;
    color: #E2E8F0;
    border: 1px solid #0F172A;
}
QFrame#PreviewCanvas {
    background: #EAF1F7;
    border-radius: 16px;
}
QTabWidget::pane { border: 1px solid #E2E8F0; border-radius: 12px; background: #FFFFFF; }
QTabBar::tab {
    background: #F8FAFC;
    color: #475569;
    padding: 8px 14px;
    margin-right: 4px;
    border-top-left-radius: 10px;
    border-top-right-radius: 10px;
    border: 1px solid #E2E8F0;
}
QTabBar::tab:selected { background: #16213A; color: white; }
QHeaderView::section {
    background: #F8FAFC;
    color: #475569;
    padding: 8px;
    border: none;
    border-bottom: 1px solid #E2E8F0;
    font-weight: 700;
}
QTableWidget { gridline-color: #E2E8F0; padding: 0; }
QFrame#TenantOptionCard { background: #F8FAFC; border-radius: 16px; }
QFrame#TenantOptionCard[selected="true"] { background: #EEF6FF; border: 1px solid #60A5FA; }
QLabel#TenantName { color: #0F172A; font-size: 15px; font-weight: 900; }
QLabel#TenantCode { color: #64748B; font-size: 12px; font-weight: 600; }
QLabel#TenantBadge, QLabel#TenantSelectedBadge {
    border-radius: 10px; padding: 3px 8px; font-size: 11px; font-weight: 900;
}
QLabel#TenantBadge { color: #0F766E; background: #CCFBF1; }
QLabel#TenantSelectedBadge { color: #1D4ED8; background: #DBEAFE; }
"""


@dataclass
class GuiSettings:
    api_base_url: str = "http://localhost:3000"
    token_cache_path: str = "config/core_session.json"
    remember_credentials: bool = False
    username: str = ""
    password: str = ""
    tenant_id: str = ""
    gui_log_enabled: bool = True
    interface_trace_enabled: bool = True
    browser_name: str = "chromium"
    prepare_runtime_before_start: bool = True
    auto_restore_session: bool = True


class SettingsStore:
    def __init__(self, project_root: Path) -> None:
        self.project_root = project_root
        self.config_dir = project_root / "config"
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.path = self.config_dir / "gui_settings.json"
        self.env_path = project_root / ".env"

    def load(self) -> GuiSettings:
        settings = GuiSettings(api_base_url=self._env_api_base_url() or GuiSettings.api_base_url)
        if not self.path.exists():
            return settings
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return settings
        password = str(data.get("password") or "")
        if password:
            try:
                password = base64.b64decode(password.encode("utf-8")).decode("utf-8")
            except Exception:
                pass
        browser_name = str(data.get("browserName") or "chromium").strip().lower()
        if browser_name in {"chrome", "auto"}:
            browser_name = "chromium"
        return GuiSettings(
            api_base_url=self._env_api_base_url() or str(data.get("apiBaseUrl") or settings.api_base_url),
            token_cache_path=str(data.get("tokenCachePath") or settings.token_cache_path),
            remember_credentials=bool(data.get("rememberCredentials", False)),
            username=str(data.get("username") or ""),
            password=password if bool(data.get("rememberCredentials", False)) else "",
            tenant_id=str(data.get("tenantId") or ""),
            gui_log_enabled=bool(data.get("guiLogEnabled", True)),
            interface_trace_enabled=bool(data.get("interfaceTraceEnabled", True)),
            browser_name=browser_name or "chromium",
            prepare_runtime_before_start=bool(data.get("prepareRuntimeBeforeStart", True)),
            auto_restore_session=bool(data.get("autoRestoreSession", True)),
        )

    def save(self, settings: GuiSettings) -> None:
        password = ""
        if settings.remember_credentials and settings.password:
            password = base64.b64encode(settings.password.encode("utf-8")).decode("utf-8")
        payload = {
            "apiBaseUrl": settings.api_base_url,
            "tokenCachePath": settings.token_cache_path,
            "rememberCredentials": settings.remember_credentials,
            "username": settings.username if settings.remember_credentials else "",
            "password": password,
            "tenantId": settings.tenant_id,
            "guiLogEnabled": settings.gui_log_enabled,
            "interfaceTraceEnabled": settings.interface_trace_enabled,
            "browserName": settings.browser_name or "chromium",
            "prepareRuntimeBeforeStart": settings.prepare_runtime_before_start,
            "autoRestoreSession": settings.auto_restore_session,
        }
        self.path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def _env_api_base_url(self) -> str:
        value = os.getenv("CORE_NEXUS_API_BASE_URL") or os.getenv("API_BASE_URL")
        if value:
            return value.rstrip("/")
        if not self.env_path.exists():
            return ""
        try:
            for line in self.env_path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                if key.strip() in {"CORE_NEXUS_API_BASE_URL", "API_BASE_URL"}:
                    return value.strip().strip('"').strip("'").rstrip("/")
        except Exception:
            return ""
        return ""


class LoginPage(QWidget):
    login_requested = Signal(str, str, bool)

    def __init__(self) -> None:
        super().__init__()
        root = QVBoxLayout(self)
        root.setContentsMargins(28, 28, 28, 28)
        root.addStretch(1)

        row = QHBoxLayout()
        row.addStretch(1)
        card = QFrame()
        card.setObjectName("LoginCard")
        card.setMinimumWidth(430)
        card.setMaximumWidth(520)
        lay = QVBoxLayout(card)
        lay.setContentsMargins(42, 40, 42, 40)
        lay.setSpacing(15)

        logo = QLabel("IC")
        logo.setObjectName("BrandLogo")
        lay.addWidget(logo, 0, Qt.AlignmentFlag.AlignHCenter)

        title = QLabel("截流机器人工作台")
        title.setObjectName("LoginTitle")
        title.setAlignment(Qt.AlignmentFlag.AlignHCenter)
        lay.addWidget(title)

        subtitle = QLabel("登录 Core Nexus 后，按租户权限加载截流机器人")
        subtitle.setObjectName("LoginSubtitle")
        subtitle.setAlignment(Qt.AlignmentFlag.AlignHCenter)
        subtitle.setWordWrap(True)
        lay.addWidget(subtitle)
        lay.addSpacing(8)

        self.username_edit = QLineEdit()
        self.username_edit.setObjectName("LoginInput")
        self.username_edit.setPlaceholderText("请输入账号")
        lay.addWidget(self._label("账号"))
        lay.addWidget(self.username_edit)

        self.password_edit = QLineEdit()
        self.password_edit.setObjectName("LoginInput")
        self.password_edit.setPlaceholderText("请输入密码")
        self.password_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.password_toggle = QToolButton()
        self.password_toggle.setObjectName("PasswordToggle")
        self.password_toggle.setText("显示")
        self.password_toggle.setCheckable(True)
        self.password_toggle.clicked.connect(self._toggle_password)
        pass_row = QHBoxLayout()
        pass_row.setContentsMargins(0, 0, 0, 0)
        pass_row.setSpacing(8)
        pass_row.addWidget(self.password_edit, 1)
        pass_row.addWidget(self.password_toggle)
        lay.addWidget(self._label("密码"))
        lay.addLayout(pass_row)

        option_row = QHBoxLayout()
        option_row.setContentsMargins(0, 0, 0, 0)
        self.remember_checkbox = QCheckBox("记住账号和密码")
        option_row.addWidget(self.remember_checkbox)
        option_row.addStretch(1)
        lay.addLayout(option_row)

        self.message_label = QLabel("接口地址从配置读取；登录后会自动判断租户并进入工作台。")
        self.message_label.setObjectName("LoginSubtitle")
        self.message_label.setWordWrap(True)
        lay.addWidget(self.message_label)

        self.login_button = QPushButton("登录")
        self.login_button.setObjectName("LoginPrimaryButton")
        self.login_button.clicked.connect(self._emit_login)
        lay.addWidget(self.login_button)

        row.addWidget(card)
        row.addStretch(1)
        root.addLayout(row)
        root.addStretch(1)
        self.password_edit.returnPressed.connect(self._emit_login)
        self.username_edit.returnPressed.connect(lambda: self.password_edit.setFocus())

    def _label(self, text: str) -> QLabel:
        label = QLabel(text)
        label.setObjectName("FieldHint")
        return label

    def set_saved_settings(self, settings: GuiSettings) -> None:
        self.username_edit.setText(settings.username)
        self.password_edit.setText(settings.password)
        self.remember_checkbox.setChecked(settings.remember_credentials)

    def set_loading(self, loading: bool) -> None:
        self.login_button.setEnabled(not loading)
        self.login_button.setText("登录中..." if loading else "登录")

    def set_message(self, text: str, error: bool = False) -> None:
        self.message_label.setText(text)
        self.message_label.setStyleSheet("color: #B91C1C;" if error else "")

    def _toggle_password(self) -> None:
        visible = self.password_toggle.isChecked()
        self.password_edit.setEchoMode(QLineEdit.EchoMode.Normal if visible else QLineEdit.EchoMode.Password)
        self.password_toggle.setText("隐藏" if visible else "显示")

    def _emit_login(self) -> None:
        self.login_requested.emit(self.username_edit.text().strip(), self.password_edit.text(), self.remember_checkbox.isChecked())


@dataclass(slots=True)
class TenantChoice:
    tenant_id: str
    tenant_name: str
    tenant_code: str = ""
    is_default: bool = False


class TenantOptionCard(QFrame):
    def __init__(self, tenant: TenantChoice) -> None:
        super().__init__()
        self.setObjectName("TenantOptionCard")
        self.setMinimumHeight(82)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 12, 16, 12)
        layout.setSpacing(6)
        row = QHBoxLayout()
        name = QLabel(tenant.tenant_name)
        name.setObjectName("TenantName")
        name.setWordWrap(True)
        row.addWidget(name, 1)
        if tenant.is_default:
            badge = QLabel("默认")
            badge.setObjectName("TenantBadge")
            row.addWidget(badge, 0, Qt.AlignmentFlag.AlignTop)
        self.selected_badge = QLabel("已选")
        self.selected_badge.setObjectName("TenantSelectedBadge")
        self.selected_badge.setVisible(False)
        row.addWidget(self.selected_badge, 0, Qt.AlignmentFlag.AlignTop)
        layout.addLayout(row)
        code = QLabel(tenant.tenant_code or tenant.tenant_id)
        code.setObjectName("TenantCode")
        code.setWordWrap(True)
        code.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        layout.addWidget(code)

    def set_selected(self, selected: bool) -> None:
        self.setProperty("selected", bool(selected))
        self.selected_badge.setVisible(bool(selected))
        self.style().unpolish(self)
        self.style().polish(self)
        self.update()


class TenantSelectDialog(QDialog):
    def __init__(self, tenants: list[TenantChoice], parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("SettingsDialog")
        self.setWindowTitle("选择租户")
        self.setModal(True)
        self.setMinimumWidth(560)
        self.tenants = list(tenants)
        root = QVBoxLayout(self)
        root.setContentsMargins(26, 24, 26, 24)
        root.setSpacing(14)
        title = QLabel("选择工作空间")
        title.setObjectName("LoginTitle")
        title.setAlignment(Qt.AlignmentFlag.AlignHCenter)
        root.addWidget(title)
        tip = QLabel("当前账号可进入多个租户，请选择本次截流机器人运行使用的租户。")
        tip.setObjectName("LoginSubtitle")
        tip.setWordWrap(True)
        tip.setAlignment(Qt.AlignmentFlag.AlignHCenter)
        root.addWidget(tip)
        self.list_widget = QListWidget()
        self.list_widget.setObjectName("RobotListWidget")
        self.list_widget.setMinimumHeight(260)
        self.list_widget.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.list_widget.itemDoubleClicked.connect(lambda _item: self.accept_if_selected())
        self.list_widget.currentItemChanged.connect(lambda _current, _previous: self._refresh_selected_badges())
        root.addWidget(self.list_widget, 1)
        for tenant in self.tenants:
            item = QListWidgetItem()
            item.setData(Qt.ItemDataRole.UserRole, tenant.tenant_id)
            widget = TenantOptionCard(tenant)
            item.setSizeHint(QSize(0, 88))
            self.list_widget.addItem(item)
            self.list_widget.setItemWidget(item, widget)
        if self.tenants:
            default_idx = next((i for i, item in enumerate(self.tenants) if item.is_default), 0)
            self.list_widget.setCurrentRow(default_idx)
        self._refresh_selected_badges()
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        buttons.button(QDialogButtonBox.StandardButton.Ok).setText("进入工作台")
        buttons.button(QDialogButtonBox.StandardButton.Cancel).setText("返回登录")
        buttons.accepted.connect(self.accept_if_selected)
        buttons.rejected.connect(self.reject)
        root.addWidget(buttons)

    def selected_tenant_id(self) -> str:
        item = self.list_widget.currentItem()
        return str(item.data(Qt.ItemDataRole.UserRole) or "") if item else ""

    def accept_if_selected(self) -> None:
        if not self.selected_tenant_id():
            QMessageBox.warning(self, "请选择租户", "租户为必选项，请先选择一个工作空间。")
            return
        self.accept()

    def _refresh_selected_badges(self) -> None:
        current = self.list_widget.currentItem()
        for row in range(self.list_widget.count()):
            item = self.list_widget.item(row)
            widget = self.list_widget.itemWidget(item)
            if hasattr(widget, "set_selected"):
                widget.set_selected(item is current)


class TopBar(QFrame):
    platform_changed = Signal(str)
    settings_requested = Signal()
    logout_requested = Signal()

    def __init__(self) -> None:
        super().__init__()
        self.setObjectName("TopBar")
        root = QHBoxLayout(self)
        root.setContentsMargins(16, 14, 16, 14)
        root.setSpacing(12)
        logo = QLabel("IC")
        logo.setObjectName("TopBarLogo")
        root.addWidget(logo)
        self.platform_group = QButtonGroup(self)
        self.platform_group.setExclusive(True)
        self.platform_buttons: dict[str, QPushButton] = {}
        for code, label in PLATFORMS:
            btn = QPushButton(label if code == "douyin" else f"{label}（未实现）")
            if code != "douyin":
                btn.setEnabled(False)
                btn.setToolTip("当前正式采集和私信链路仅实现抖音")
            btn.setObjectName("TopPlatformButton")
            btn.setCheckable(True)
            btn.clicked.connect(lambda checked=False, p=code: self.platform_changed.emit(p))
            self.platform_group.addButton(btn)
            self.platform_buttons[code] = btn
            root.addWidget(btn)
        self.platform_buttons["douyin"].setChecked(True)
        root.addSpacing(8)
        self.page_title = QLabel("截流机器人工作台")
        self.page_title.setObjectName("TopPageTitle")
        root.addWidget(self.page_title, 1)
        right_box = QVBoxLayout()
        right_box.setContentsMargins(0, 0, 0, 0)
        right_box.setSpacing(2)
        self.session_label = QLabel("未登录")
        self.session_label.setObjectName("TopStatusHint")
        self.runtime_label = QLabel("请选择左侧机器人并启动")
        self.runtime_label.setObjectName("TopStatusHint")
        right_box.addWidget(self.session_label)
        right_box.addWidget(self.runtime_label)
        root.addLayout(right_box)
        self.settings_button = QPushButton("设置")
        self.settings_button.setObjectName("GhostButton")
        self.settings_button.clicked.connect(self.settings_requested.emit)
        root.addWidget(self.settings_button)
        self.logout_button = QPushButton("退出登录")
        self.logout_button.setObjectName("GhostButton")
        self.logout_button.clicked.connect(self.logout_requested.emit)
        root.addWidget(self.logout_button)

    def set_platform(self, platform: str) -> None:
        if platform in self.platform_buttons:
            self.platform_buttons[platform].setChecked(True)

    def set_session(self, session: Optional[CoreNexusSession]) -> None:
        if not session:
            self.session_label.setText("未登录")
            return
        self.session_label.setText(f"当前租户：{_tenant_name_from_session(session) or '-'}    登录账号：{_session_user_name(session)}")

    def set_runtime_hint(self, text: str) -> None:
        self.runtime_label.setText(text)


class RobotAvatarGlyph(QWidget):
    """Reference-scale vector avatar used by the robot card header."""

    _BASE_SIZE = 54

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        # 紧凑侧栏保留头像作为标题区的视觉锚点，并按原始窄栏尺度收敛。
        self.setFixedSize(48, 48)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)

    def paintEvent(self, event) -> None:  # type: ignore[override]
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        scale = min(self.width(), self.height()) / self._BASE_SIZE
        painter.translate((self.width() - self._BASE_SIZE * scale) / 2, (self.height() - self._BASE_SIZE * scale) / 2)
        painter.scale(scale, scale)
        ink = QColor("#2563D7")
        background = QColor("#EAF3FF")
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(background)
        painter.drawRoundedRect(2, 2, 50, 50, 15, 15)

        pen = QPen(ink, 2)
        pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        pen.setJoinStyle(Qt.PenJoinStyle.RoundJoin)
        painter.setPen(pen)
        painter.setBrush(QColor("#FFFFFF"))
        painter.drawLine(27, 13, 27, 18)
        painter.setBrush(ink)
        painter.drawEllipse(24, 9, 6, 6)
        painter.setBrush(QColor("#FFFFFF"))
        painter.drawRoundedRect(15, 20, 24, 19, 6, 6)
        painter.drawRoundedRect(12, 24, 4, 10, 2, 2)
        painter.drawRoundedRect(38, 24, 4, 10, 2, 2)
        painter.setBrush(ink)
        painter.drawEllipse(21, 26, 4, 4)
        painter.drawEllipse(30, 26, 4, 4)
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.drawArc(22, 29, 10, 6, 195 * 16, 150 * 16)
        painter.end()


class CardLogButton(QToolButton):
    """Document-shaped log shortcut, matching the supplied reference artwork."""

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.setFixedSize(22, 22)
        self.setText("")

    def paintEvent(self, event) -> None:  # type: ignore[override]
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        if self.underMouse() and self.isEnabled():
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(QColor("#EAF3FF"))
            painter.drawRoundedRect(0, 0, self.width(), self.height(), 8, 8)
        ink = QColor("#2B68D7") if self.isEnabled() else QColor("#94A3B8")
        painter.save()
        scale = min(self.width(), self.height()) / 28.0
        painter.scale(scale, scale)
        pen = QPen(ink, 2)
        pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        pen.setJoinStyle(Qt.PenJoinStyle.RoundJoin)
        painter.setPen(pen)
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.drawRoundedRect(8, 5, 17, 24, 2, 2)
        painter.drawLine(19, 5, 25, 11)
        painter.drawLine(19, 5, 19, 11)
        painter.drawLine(19, 11, 25, 11)
        painter.drawLine(12, 16, 21, 16)
        painter.drawLine(12, 21, 21, 21)
        painter.restore()
        painter.end()


class CardMetaGlyph(QWidget):
    """Reference-scale blue user/clock glyph used in the metadata panel."""

    _BASE_SIZE = 22

    def __init__(self, kind: str, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.kind = kind
        self.setFixedSize(18, 18)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)

    def paintEvent(self, event) -> None:  # type: ignore[override]
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        scale = min(self.width(), self.height()) / self._BASE_SIZE
        painter.translate((self.width() - self._BASE_SIZE * scale) / 2, (self.height() - self._BASE_SIZE * scale) / 2)
        painter.scale(scale, scale)
        ink = QColor("#2563D7")
        pen = QPen(ink, 2)
        pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        pen.setJoinStyle(Qt.PenJoinStyle.RoundJoin)
        painter.setPen(pen)
        if self.kind == "user":
            painter.setBrush(ink)
            painter.drawEllipse(7, 2, 8, 8)
            painter.drawRoundedRect(3, 12, 16, 8, 5, 5)
        else:
            painter.setBrush(Qt.BrushStyle.NoBrush)
            painter.drawEllipse(3, 3, 16, 16)
            painter.drawLine(11, 7, 11, 11)
            painter.drawLine(11, 11, 14, 13)
        painter.end()


class RobotListPanel(QFrame):
    robot_selected = Signal(str)
    refresh_requested = Signal()
    start_requested = Signal(str)
    stop_requested = Signal(str)
    log_requested = Signal(str)
    export_requested = Signal(str)
    continue_sync_requested = Signal(str)
    recover_requested = Signal(str)
    robot_type_changed = Signal(str)

    def __init__(self) -> None:
        super().__init__()
        self.setObjectName("RobotListPanel")
        # 恢复原始窄栏工作宽度；只保留新的三段式信息结构，不再放大侧栏。
        self.setMinimumWidth(330)
        self.setMaximumWidth(420)
        self._id_to_item: dict[str, QListWidgetItem] = {}
        self._robots: list[dict[str, Any]] = []
        self.current_robot_type = "INTERCEPT"
        root = QVBoxLayout(self)
        root.setContentsMargins(16, 18, 16, 18)
        root.setSpacing(12)
        header = QHBoxLayout()
        header.setContentsMargins(0, 0, 0, 0)
        header.setSpacing(8)
        title = QLabel("机器人列表")
        title.setObjectName("RobotListTitle")
        header.addWidget(title)
        header.addStretch(1)
        self.count_label = QLabel("0 个")
        self.count_label.setObjectName("RobotListCount")
        header.addWidget(self.count_label, 0, Qt.AlignmentFlag.AlignVCenter)
        self.refresh_button = QPushButton("⟳  刷新")
        self.refresh_button.setObjectName("RobotRefreshButton")
        self.refresh_button.clicked.connect(self.refresh_requested.emit)
        header.addWidget(self.refresh_button, 0, Qt.AlignmentFlag.AlignVCenter)
        root.addLayout(header)
        tab_row = QHBoxLayout()
        tab_row.setContentsMargins(0, 0, 0, 0)
        tab_row.setSpacing(8)
        self.intercept_btn = QPushButton("截流")
        self.intercept_btn.setCheckable(True)
        self.intercept_btn.setChecked(True)
        self.intercept_btn.setObjectName("RobotTypeTab")
        self.intercept_btn.clicked.connect(lambda: self.switch_robot_type("INTERCEPT"))
        tab_row.addWidget(self.intercept_btn)
        self.private_btn = QPushButton("私信")
        self.private_btn.setCheckable(True)
        self.private_btn.setObjectName("RobotTypeTab")
        self.private_btn.clicked.connect(lambda: self.switch_robot_type("LEAD_PRIVATE_MESSAGE"))
        tab_row.addWidget(self.private_btn)
        tab_row.addStretch(1)
        root.addLayout(tab_row)
        self.list_widget = QListWidget()
        self.list_widget.setObjectName("RobotListWidget")
        self.list_widget.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.list_widget.setSpacing(8)
        self.list_widget.itemSelectionChanged.connect(self._on_selected)
        root.addWidget(self.list_widget, 1)

    def switch_robot_type(self, robot_type: str) -> None:
        robot_type = "LEAD_PRIVATE_MESSAGE" if robot_type == "LEAD_PRIVATE_MESSAGE" else "INTERCEPT"
        if robot_type == self.current_robot_type:
            self.intercept_btn.setChecked(robot_type == "INTERCEPT")
            self.private_btn.setChecked(robot_type == "LEAD_PRIVATE_MESSAGE")
            return
        self.current_robot_type = robot_type
        self.intercept_btn.setChecked(robot_type == "INTERCEPT")
        self.private_btn.setChecked(robot_type == "LEAD_PRIVATE_MESSAGE")
        self.robot_type_changed.emit(robot_type)

    def type_label(self) -> str:
        return "主动私信机器人" if self.current_robot_type == "LEAD_PRIVATE_MESSAGE" else "截流机器人"

    def set_refreshing(self, loading: bool) -> None:
        if hasattr(self, "refresh_button"):
            self.refresh_button.setEnabled(not loading)
            self.refresh_button.setText("刷新中..." if loading else "刷新")

    def set_robots(self, robots: list[dict[str, Any]], selected_id: str = "", running_id: str = "", running_ids: Iterable[str] | None = None) -> None:
        running_set = set(str(x) for x in (running_ids or ([] if not running_id else [running_id])) if str(x or "").strip())
        self._robots = list(robots)
        self.list_widget.clear()
        self._id_to_item.clear()
        self.count_label.setText(f"{len(robots)} 个")
        if not robots:
            empty = QListWidgetItem(f"暂无匹配的{self.type_label()}")
            empty.setFlags(Qt.ItemFlag.NoItemFlags)
            self.list_widget.addItem(empty)
            return
        for robot in robots:
            rid = _robot_id(robot)
            item = QListWidgetItem()
            item.setData(Qt.ItemDataRole.UserRole, rid)
            widget = self._build_card(robot, running=rid in running_set)
            # 原始窄栏尺寸下保留三段式层级：标题、账号授权、操作；不再按设计稿原尺寸放大。
            item.setSizeHint(QSize(0, 230))
            self.list_widget.addItem(item)
            self.list_widget.setItemWidget(item, widget)
            self._id_to_item[rid] = item
        if selected_id and selected_id in self._id_to_item:
            self.list_widget.setCurrentItem(self._id_to_item[selected_id])
        elif robots:
            self.list_widget.setCurrentRow(0)

    def set_selected_robot(self, robot_id: str) -> None:
        item = self._id_to_item.get(robot_id)
        if item:
            self.list_widget.setCurrentItem(item)

    def update_card_state(self, robot_id: str, running: bool, auth_pending: bool = False) -> None:
        item = self._id_to_item.get(robot_id)
        if not item:
            return
        widget = self.list_widget.itemWidget(item)
        if not widget:
            return
        status_label = widget.findChild(QLabel, "runtimeLabel")
        start_btn = next((btn for btn in widget.findChildren(QPushButton) if btn.accessibleName() == "startButton"), None)
        stop_btn = next((btn for btn in widget.findChildren(QPushButton) if btn.accessibleName() == "stopButton"), None)
        continue_btn = next((btn for btn in widget.findChildren(QPushButton) if btn.accessibleName() == "continueSyncButton"), None)
        recover_btn = next((btn for btn in widget.findChildren(QPushButton) if btn.accessibleName() == "recoverInterceptButton"), None)
        more_btn = next((btn for btn in widget.findChildren(QToolButton) if btn.accessibleName() == "moreActionsButton"), None)
        robot = next((x for x in self._robots if _robot_id(x) == robot_id), {})
        disabled = _robot_status(robot) in {"DISABLED", "EXPIRED"}
        if status_label:
            if auth_pending:
                status_label.setText("等待登录")
                status_label.setStyleSheet(_badge_style("STOPPING"))
            elif running:
                status_label.setText("运行中")
                status_label.setStyleSheet(_badge_style("RUNNING"))
            else:
                status_label.setText(_status_label(robot))
                status_label.setStyleSheet(_badge_style(_robot_status(robot)))
        busy = bool(running or auth_pending)
        if start_btn:
            start_btn.setEnabled(not disabled and not busy)
        if stop_btn:
            stop_btn.setEnabled(busy or _robot_status(robot) in {"RUNNING", "STOPPING"})
        if continue_btn:
            continue_btn.setEnabled(not disabled and not busy and self.current_robot_type == "INTERCEPT")
        if recover_btn:
            recover_btn.setEnabled(not disabled and not busy and self.current_robot_type == "INTERCEPT")
        if more_btn:
            more_btn.setVisible(self.current_robot_type == "INTERCEPT")
            menu = more_btn.menu()
            has_enabled_menu_action = False
            if menu is not None:
                for action in menu.actions():
                    label = str(action.text() or "").strip()
                    if label == "导出":
                        action.setEnabled(not disabled and not busy and self.current_robot_type == "INTERCEPT")
                    elif label == "继续同步":
                        action.setEnabled(not disabled and not busy and self.current_robot_type == "INTERCEPT")
                    elif label == "恢复任务":
                        action.setEnabled(not disabled and not busy and self.current_robot_type == "INTERCEPT")
                    if action.isVisible() and action.isEnabled():
                        has_enabled_menu_action = True
                more_btn.setEnabled(has_enabled_menu_action)

    def _build_card(self, robot: dict[str, Any], running: bool = False) -> QWidget:
        """Build a compact three-stage card for the sidebar.

        Signals, accessible names and menu actions stay unchanged. This is deliberately
        a visual-only rewrite: execution, stop, diagnostics, export, resume and recovery
        still use their existing handlers.
        """
        rid = _robot_id(robot)
        box = QFrame()
        box.setObjectName("RobotCard")
        box.setProperty("selected", "false")
        box.setFixedHeight(230)
        lay = QVBoxLayout(box)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)

        # 1) Header: avatar, name/log shortcut and runtime badge.
        header_shell = QWidget()
        header_shell.setObjectName("RobotCardHeader")
        header_shell.setFixedHeight(72)
        header = QHBoxLayout(header_shell)
        header.setContentsMargins(12, 12, 12, 12)
        header.setSpacing(10)
        avatar = RobotAvatarGlyph()
        avatar.setToolTip(self.type_label())
        header.addWidget(avatar, 0, Qt.AlignmentFlag.AlignVCenter)

        name_wrap = QVBoxLayout()
        name_wrap.setContentsMargins(0, 0, 0, 0)
        name_wrap.setSpacing(2)
        name_row = QHBoxLayout()
        name_row.setContentsMargins(0, 0, 0, 0)
        name_row.setSpacing(4)
        name = QLabel(_robot_name(robot))
        name.setObjectName("RobotName")
        name.setWordWrap(False)
        name.setToolTip(_robot_name(robot))
        name_row.addWidget(name, 0, Qt.AlignmentFlag.AlignVCenter)

        # 日志依旧是原有日志入口，只将其还原为图稿中的文档图标。
        log_btn = CardLogButton()
        log_btn.setObjectName("CardLogButton")
        log_btn.setAccessibleName("logButton")
        gui_log_enabled, interface_trace_enabled, diag_visible = _diagnostics_visibility(robot)
        log_btn.setVisible(diag_visible)
        log_btn.setEnabled(diag_visible)
        log_btn.setToolTip("查看当前机器人日志与接口请求" if gui_log_enabled and interface_trace_enabled else "查看当前机器人运行诊断")
        log_btn.clicked.connect(lambda _=False, robot_id=rid: self.log_requested.emit(robot_id))
        name_row.addWidget(log_btn, 0, Qt.AlignmentFlag.AlignVCenter)
        name_row.addStretch(1)
        name_wrap.addLayout(name_row)

        robot_type = QLabel(self.type_label())
        robot_type.setObjectName("RobotTypeLabel")
        name_wrap.addWidget(robot_type, 0, Qt.AlignmentFlag.AlignLeft)
        header.addLayout(name_wrap, 1)

        status = QLabel("运行中" if running else _status_label(robot))
        status.setObjectName("runtimeLabel")
        status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        status.setStyleSheet(_badge_style("RUNNING" if running else _robot_status(robot)))
        header.addWidget(status, 0, Qt.AlignmentFlag.AlignVCenter)
        lay.addWidget(header_shell)

        top_divider = QFrame()
        top_divider.setObjectName("CardDivider")
        top_divider.setFrameShape(QFrame.Shape.HLine)
        top_divider.setFrameShadow(QFrame.Shadow.Plain)
        lay.addWidget(top_divider)

        # 2) Metadata: full-width pale panel with two fixed rows.
        meta_shell = QWidget()
        meta_shell.setObjectName("RobotCardMetaShell")
        meta_shell.setFixedHeight(92)
        meta_shell_lay = QVBoxLayout(meta_shell)
        meta_shell_lay.setContentsMargins(10, 10, 10, 10)
        meta_shell_lay.setSpacing(0)
        meta_box = QFrame()
        meta_box.setObjectName("RobotMetaPanel")
        meta_box.setFixedHeight(72)
        meta_lay = QVBoxLayout(meta_box)
        meta_lay.setContentsMargins(12, 6, 12, 6)
        meta_lay.setSpacing(5)

        auth_row = QWidget()
        auth_lay = QHBoxLayout(auth_row)
        auth_lay.setContentsMargins(0, 0, 0, 0)
        auth_lay.setSpacing(8)
        auth_lay.addWidget(CardMetaGlyph("user"), 0, Qt.AlignmentFlag.AlignVCenter)
        auth = QLabel(_auth_summary(robot))
        auth.setObjectName("CardMetaText")
        auth.setWordWrap(False)
        auth.setToolTip(_auth_summary(robot))
        auth_lay.addWidget(auth, 1, Qt.AlignmentFlag.AlignVCenter)
        meta_lay.addWidget(auth_row)

        expire_row = QWidget()
        expire_lay = QHBoxLayout(expire_row)
        expire_lay.setContentsMargins(0, 0, 0, 0)
        expire_lay.setSpacing(8)
        expire_lay.addWidget(CardMetaGlyph("clock"), 0, Qt.AlignmentFlag.AlignVCenter)
        expire = QLabel(f"到期时间：  {_expire_display(robot)}")
        expire.setObjectName("CardMetaText")
        expire.setWordWrap(False)
        expire.setToolTip(expire.text())
        expire_lay.addWidget(expire, 1, Qt.AlignmentFlag.AlignVCenter)
        meta_lay.addWidget(expire_row)
        meta_shell_lay.addWidget(meta_box)
        lay.addWidget(meta_shell)

        bottom_divider = QFrame()
        bottom_divider.setObjectName("CardDivider")
        bottom_divider.setFrameShape(QFrame.Shape.HLine)
        bottom_divider.setFrameShadow(QFrame.Shadow.Plain)
        lay.addWidget(bottom_divider)

        # 3) Primary actions: start, stop and a right-aligned overflow menu.
        action_shell = QWidget()
        action_shell.setObjectName("RobotCardActionShell")
        action_shell.setFixedHeight(64)
        action = QHBoxLayout(action_shell)
        action.setContentsMargins(12, 14, 12, 14)
        action.setSpacing(8)
        start = QPushButton("▶ 启动")
        start.setObjectName("CardStartButton")
        start.setAccessibleName("startButton")
        start.clicked.connect(lambda _=False, robot_id=rid: self.start_requested.emit(robot_id))
        action.addWidget(start, 0)
        stop = QPushButton("■ 停止")
        stop.setObjectName("CardStopButton")
        stop.setAccessibleName("stopButton")
        stop.clicked.connect(lambda _=False, robot_id=rid: self.stop_requested.emit(robot_id))
        action.addWidget(stop, 0)
        action.addStretch(1)

        more_btn = QToolButton()
        more_btn.setObjectName("CardMoreButton")
        more_btn.setAccessibleName("moreActionsButton")
        more_btn.setText("•••")
        more_btn.setToolTip("更多操作")
        more_btn.setPopupMode(QToolButton.ToolButtonPopupMode.InstantPopup)
        more_menu = QMenu(more_btn)
        export_action = more_menu.addAction("导出")
        export_action.setToolTip("导出最近一次处理过的作品判断表")
        export_action.triggered.connect(lambda _=False, robot_id=rid: self.export_requested.emit(robot_id))
        continue_action = more_menu.addAction("继续同步")
        continue_action.setToolTip("继续同步本地未完成的截流捕获数据；不会重新采集、口播或抓评论")
        continue_action.triggered.connect(lambda _=False, robot_id=rid: self.continue_sync_requested.emit(robot_id))
        recover_action = more_menu.addAction("恢复任务")
        recover_action.setToolTip("恢复中断或卡住的截流任务：保留已完成作品，从未完成作品继续")
        recover_action.triggered.connect(lambda _=False, robot_id=rid: self.recover_requested.emit(robot_id))
        more_btn.setMenu(more_menu)
        more_btn.setVisible(self.current_robot_type == "INTERCEPT")
        action.addWidget(more_btn, 0, Qt.AlignmentFlag.AlignVCenter)
        lay.addWidget(action_shell)

        disabled = _robot_status(robot) in {"DISABLED", "EXPIRED"}
        start.setEnabled(not disabled and not running)
        stop.setEnabled(running or _robot_status(robot) in {"RUNNING", "STOPPING"})
        export_action.setEnabled(not disabled and not running and self.current_robot_type == "INTERCEPT")
        continue_action.setEnabled(not disabled and not running and self.current_robot_type == "INTERCEPT")
        recover_action.setEnabled(not disabled and not running and self.current_robot_type == "INTERCEPT")
        more_btn.setEnabled(any(action.isEnabled() and action.isVisible() for action in more_menu.actions()))
        return box

    def _on_selected(self) -> None:
        items = self.list_widget.selectedItems()
        if not items:
            return
        rid = items[0].data(Qt.ItemDataRole.UserRole)
        if rid:
            self.robot_selected.emit(str(rid))


class LogDialog(QDialog):
    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setObjectName("LogDialog")
        self.setWindowTitle("日志与接口详情")
        self.resize(1180, 720)
        self.request_entries: list[dict[str, Any]] = []
        self.gui_log_enabled = True
        self.interface_trace_enabled = True
        root = QVBoxLayout(self)
        root.setContentsMargins(14, 14, 14, 14)
        root.setSpacing(10)
        header = QHBoxLayout()
        self.title_label = QLabel("日志中心")
        self.title_label.setObjectName("SectionTitle")
        header.addWidget(self.title_label)
        header.addStretch(1)
        self.summary_label = QLabel("0 条请求")
        self.summary_label.setObjectName("TopStatusHint")
        header.addWidget(self.summary_label)
        self.copy_log_btn = QPushButton("复制日志")
        self.copy_log_btn.setObjectName("GhostButton")
        self.copy_log_btn.clicked.connect(self.copy_logs)
        header.addWidget(self.copy_log_btn)
        self.copy_req_btn = QPushButton("复制请求详情")
        self.copy_req_btn.setObjectName("GhostButton")
        self.copy_req_btn.clicked.connect(self.copy_request_detail)
        header.addWidget(self.copy_req_btn)
        self.clear_btn = QPushButton("清空")
        self.clear_btn.setObjectName("GhostButton")
        self.clear_btn.clicked.connect(self.clear_all)
        header.addWidget(self.clear_btn)
        root.addLayout(header)
        self.tabs = QTabWidget()
        root.addWidget(self.tabs, 1)
        self.log_view = QPlainTextEdit()
        self.log_view.setObjectName("LogView")
        self.log_view.setReadOnly(True)
        self.log_view.setLineWrapMode(QPlainTextEdit.LineWrapMode.NoWrap)
        self.log_view.document().setMaximumBlockCount(800)
        self.log_tab_index = self.tabs.addTab(self.log_view, "运行日志")
        req_tab = QWidget()
        req_root = QVBoxLayout(req_tab)
        req_root.setContentsMargins(0, 0, 0, 0)
        splitter = QSplitter(Qt.Orientation.Horizontal)
        req_root.addWidget(splitter, 1)
        self.request_table = QTableWidget(0, 5)
        self.request_table.setHorizontalHeaderLabels(["时间", "方法", "状态", "耗时", "路径"])
        self.request_table.horizontalHeader().setStretchLastSection(True)
        self.request_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.request_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.request_table.itemSelectionChanged.connect(self._show_selected_request)
        splitter.addWidget(self.request_table)
        self.request_detail = QTextEdit()
        self.request_detail.setObjectName("RequestDetail")
        self.request_detail.setReadOnly(True)
        splitter.addWidget(self.request_detail)
        splitter.setSizes([560, 620])
        self.request_tab_index = self.tabs.addTab(req_tab, "接口详情")

    def set_feature_visibility(self, *, gui_log_enabled: bool, interface_trace_enabled: bool) -> None:
        self.gui_log_enabled = bool(gui_log_enabled)
        self.interface_trace_enabled = bool(interface_trace_enabled)
        self.tabs.setTabVisible(self.log_tab_index, self.gui_log_enabled)
        self.tabs.setTabVisible(self.request_tab_index, self.interface_trace_enabled)
        self.copy_log_btn.setVisible(self.gui_log_enabled)
        self.copy_req_btn.setVisible(self.interface_trace_enabled)
        self.summary_label.setVisible(self.interface_trace_enabled)
        self.clear_btn.setVisible(self.gui_log_enabled or self.interface_trace_enabled)
        if self.gui_log_enabled:
            self.tabs.setCurrentIndex(self.log_tab_index)
        elif self.interface_trace_enabled:
            self.tabs.setCurrentIndex(self.request_tab_index)

    def set_context(self, title: str) -> None:
        self.title_label.setText(title or "日志中心")
        self.setWindowTitle(title or "日志与接口详情")

    def set_lines(self, lines: Iterable[str]) -> None:
        if not self.gui_log_enabled:
            self.log_view.clear()
            return
        safe_lines = [self._truncate_text(line, 3000) for line in list(lines)[-800:]]
        self.log_view.setPlainText("\n".join(safe_lines))
        self.log_view.moveCursor(QTextCursor.MoveOperation.End)

    def append_lines(self, lines: Iterable[str]) -> None:
        if not self.gui_log_enabled:
            return
        text = "\n".join(self._truncate_text(line, 3000) for line in lines if str(line).strip())
        if text:
            self.log_view.appendPlainText(text)
            self.log_view.moveCursor(QTextCursor.MoveOperation.End)

    def set_request_entries(self, entries: list[dict[str, Any]]) -> None:
        if not self.interface_trace_enabled:
            self.request_entries.clear()
            self.request_table.setRowCount(0)
            self.request_detail.clear()
            self.summary_label.setText("0 条请求")
            return
        self.request_entries = list(entries)[-100:]
        self._reload_request_table()

    def append_request_entry(self, entry: dict[str, Any]) -> None:
        if not self.interface_trace_enabled or not isinstance(entry, dict):
            return
        self.request_entries.append(entry)
        if len(self.request_entries) > 100:
            self.request_entries = self.request_entries[-100:]
            self._reload_request_table()
            return
        row = self.request_table.rowCount()
        self.request_table.insertRow(row)
        self._fill_request_row(row, entry)
        self.summary_label.setText(f"{len(self.request_entries)} 条请求")
        self.request_table.scrollToBottom()

    def copy_logs(self) -> None:
        QApplication.clipboard().setText(self.log_view.toPlainText())

    def copy_request_detail(self) -> None:
        QApplication.clipboard().setText(self.request_detail.toPlainText())

    def clear_all(self) -> None:
        if self.gui_log_enabled:
            self.log_view.clear()
        if self.interface_trace_enabled:
            self.request_entries.clear()
            self.request_table.setRowCount(0)
            self.request_detail.clear()
            self.summary_label.setText("0 条请求")

    def _reload_request_table(self) -> None:
        self.request_table.setRowCount(0)
        for entry in self.request_entries:
            row = self.request_table.rowCount()
            self.request_table.insertRow(row)
            self._fill_request_row(row, entry)
        self.summary_label.setText(f"{len(self.request_entries)} 条请求")
        self.request_detail.clear()

    def _fill_request_row(self, row: int, entry: dict[str, Any]) -> None:
        values = [
            str(entry.get("timestamp", "")),
            str(entry.get("method", "")),
            str(entry.get("status_code", "")),
            f"{entry.get('duration_ms', 0)}ms",
            self._truncate_text(entry.get("endpoint", ""), 220),
        ]
        for col, value in enumerate(values):
            item = QTableWidgetItem(str(value))
            self.request_table.setItem(row, col, item)

    def _show_selected_request(self) -> None:
        row = self.request_table.currentRow()
        if row < 0 or row >= len(self.request_entries):
            return
        entry = self.request_entries[row]
        detail = (
            f"时间: {entry.get('timestamp', '')}\n"
            f"方法: {entry.get('method', '')}\n"
            f"地址: {entry.get('url', '')}\n"
            f"状态码: {entry.get('status_code', '')}\n"
            f"耗时: {entry.get('duration_ms', 0)}ms\n"
            f"\n请求头:\n{self._format_json(entry.get('request_headers') or {})}\n"
            f"\n请求参数:\n{self._format_json(entry.get('params') or {})}\n"
            f"\n请求体:\n{self._truncate_text(entry.get('request_body_pretty') or '{}')}\n"
            f"\n响应体:\n{self._truncate_text(entry.get('response_body_pretty') or '')}"
        )
        self.request_detail.setPlainText(detail)

    @staticmethod
    def _format_json(value: Any) -> str:
        try:
            return json.dumps(value, ensure_ascii=False, indent=2)
        except Exception:
            return str(value)

    @staticmethod
    def _truncate_text(value: Any, limit: int = 30000) -> str:
        text = str(value or "")
        return text if len(text) <= limit else text[:limit] + f"\n... 已截断，原始长度 {len(text)} 字符"


class SettingsDialog(QDialog):
    def __init__(self, owner: "DesktopWorkbench") -> None:
        super().__init__(owner)
        self.owner = owner
        self.setObjectName("SettingsDialog")
        self.setWindowTitle("工作台设置")
        self.resize(620, 500)
        root = QVBoxLayout(self)
        root.setContentsMargins(22, 22, 22, 22)
        root.setSpacing(14)
        title = QLabel("工作台设置")
        title.setObjectName("SectionTitle")
        root.addWidget(title)
        grid = QGridLayout()
        grid.setHorizontalSpacing(12)
        grid.setVerticalSpacing(12)
        self.api_base_edit = QLineEdit(owner.settings.api_base_url)
        self.token_cache_edit = QLineEdit(owner.settings.token_cache_path)
        self.tenant_edit = QLineEdit(owner.settings.tenant_id)
        self.browser_combo = QComboBox()
        self.browser_combo.addItem("Playwright Chromium（内置运行时，不调用系统 Chrome/Edge）", "chromium")
        idx = self.browser_combo.findData(owner.settings.browser_name)
        if idx >= 0:
            self.browser_combo.setCurrentIndex(idx)
        rows = [
            ("后端地址", self.api_base_edit),
            ("Token 缓存", self._token_cache_row()),
            ("默认租户 ID", self.tenant_edit),
            ("运行时浏览器", self.browser_combo),
        ]
        for row, (label, widget) in enumerate(rows):
            lab = QLabel(label)
            lab.setObjectName("FieldHint")
            grid.addWidget(lab, row, 0)
            grid.addWidget(widget, row, 1)
        root.addLayout(grid)
        self.gui_log_checkbox = QCheckBox("启用 GUI 运行日志")
        self.gui_log_checkbox.setChecked(owner.settings.gui_log_enabled)
        root.addWidget(self.gui_log_checkbox)
        self.request_trace_checkbox = QCheckBox("启用接口详情记录")
        self.request_trace_checkbox.setChecked(owner.settings.interface_trace_enabled)
        root.addWidget(self.request_trace_checkbox)
        self.prepare_runtime_checkbox = QCheckBox("启动机器人前自动检查浏览器运行时")
        self.prepare_runtime_checkbox.setChecked(owner.settings.prepare_runtime_before_start)
        root.addWidget(self.prepare_runtime_checkbox)
        self.auto_restore_checkbox = QCheckBox("启动 GUI 时自动恢复已登录会话")
        self.auto_restore_checkbox.setChecked(owner.settings.auto_restore_session)
        root.addWidget(self.auto_restore_checkbox)
        hint = QLabel("日志与接口详情仍通过机器人卡片上的“日志”按钮查看。右侧工作区保持为浏览器/扫码页面预览区域，避免主界面堆积配置和日志模块。")
        hint.setObjectName("LoginSubtitle")
        hint.setWordWrap(True)
        root.addWidget(hint)
        root.addStretch(1)
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Save | QDialogButtonBox.StandardButton.Cancel)
        buttons.accepted.connect(self._save)
        buttons.rejected.connect(self.reject)
        root.addWidget(buttons)

    def _token_cache_row(self) -> QWidget:
        row = QWidget()
        layout = QHBoxLayout(row)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)
        layout.addWidget(self.token_cache_edit, 1)
        btn = QPushButton("浏览")
        btn.setObjectName("GhostButton")
        btn.clicked.connect(self._choose_cache_file)
        layout.addWidget(btn)
        return row

    def _choose_cache_file(self) -> None:
        path, _ = QFileDialog.getSaveFileName(self, "选择 Token 缓存文件", str(self.owner._token_cache_path()), "JSON Files (*.json);;All Files (*)")
        if path:
            try:
                rel = Path(path).resolve().relative_to(self.owner.project_root)
                self.token_cache_edit.setText(str(rel))
            except Exception:
                self.token_cache_edit.setText(path)

    def _save(self) -> None:
        s = self.owner.settings
        s.api_base_url = self.api_base_edit.text().strip() or "http://localhost:3000"
        s.token_cache_path = self.token_cache_edit.text().strip() or "config/core_session.json"
        s.tenant_id = self.tenant_edit.text().strip()
        s.browser_name = str(self.browser_combo.currentData() or "chromium")
        s.gui_log_enabled = self.gui_log_checkbox.isChecked()
        s.interface_trace_enabled = self.request_trace_checkbox.isChecked()
        s.prepare_runtime_before_start = self.prepare_runtime_checkbox.isChecked()
        s.auto_restore_session = self.auto_restore_checkbox.isChecked()
        self.owner.settings_store.save(s)
        self.owner.apply_runtime_settings()
        self.accept()


class DesktopWorkbench(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.project_root = _resolve_project_root()
        self.settings_store = SettingsStore(self.project_root)
        self.settings = self.settings_store.load()
        self.client: Optional[CoreNexusClient] = None
        self.session: Optional[CoreNexusSession] = None
        self.current_platform = "douyin"
        self.current_robot_type = "INTERCEPT"
        self.robots: list[dict[str, Any]] = []
        self.robot_map: dict[str, dict[str, Any]] = {}
        self.selected_robot_id: str = ""
        # Multi-account runtime state.  The old GUI kept one global QProcess and
        # one running_robot_id, which made all robot cards share a single busy
        # lock.  Keep the legacy fields for compatibility with existing helper
        # code, but the source of truth is now the per-robot maps below.
        self.running_robot_id: str = ""
        self.running_robot_ids: set[str] = set()
        self.process: Optional[QProcess] = None
        self.processes: dict[str, QProcess] = {}
        self._process_phases: dict[str, str] = {}
        self._process_pending_tasks: dict[str, tuple[str, list[str], str]] = {}
        self._process_runtime_selected_browser: dict[str, str] = {}
        self._process_stop_requested: set[str] = set()
        self._process_last_skipped: set[str] = set()
        self._process_robot_types: dict[str, str] = {}
        self._active_process_robot_id: str = ""
        self._pending_task: Optional[tuple[str, list[str], str]] = None
        self._runtime_selected_browser_name = ""
        self._current_phase = "idle"
        self._last_process_skipped = False
        self._active_log_fp = None
        self.preview_profile = None
        self.preview_view = None
        self.preview_page = None
        self.preview_workspaces: dict[str, WebviewWorkspace] = {}
        self.active_preview_workspace_key = ""
        self._embedded_preview_initialized = False
        self._embedded_preview_robot_key = ""
        self.latest_json_path: Optional[str] = None
        self.latest_summary_path: Optional[str] = None
        self.latest_json_paths: dict[str, str] = {}
        self.latest_summary_paths: dict[str, str] = {}
        self.latest_log_path: Optional[Path] = None
        self.log_buffer: deque[str] = deque(maxlen=800)
        self.log_buffers: dict[str, deque[str]] = {}
        self.log_dialog_robot_id = ""
        self.request_buffer: deque[dict[str, Any]] = deque(maxlen=100)
        # Active workspace cookie cache alias.  Each WebEngine workspace also keeps
        # its own cache so different robot names never share login cookies in memory.
        self._platform_cookie_cache: dict[str, dict[str, dict[str, Any]]] = {}
        self._pending_platform_login_robot_id: str = ""
        self._pending_platform_login_args: Optional[list[str]] = None
        self._pending_platform_login_title: str = ""
        self._platform_login_autostart_queued = False
        self._platform_login_probe_attempts = 0
        self._platform_login_probe_token = 0
        self._platform_login_prompt_logged = False
        self._platform_login_soft_auth_detected = False
        self._platform_login_profile_auth_detected = False
        self._platform_login_profile_auth_path = ""
        self._platform_login_probe_timer = QTimer(self)
        self._platform_login_probe_timer.setSingleShot(True)
        self._platform_login_probe_timer.timeout.connect(self._probe_pending_platform_login)
        self._stop_requested = False
        self._robots_loading = False
        self._robot_load_queued = False
        self._last_robot_load_started_at = 0.0
        self._robot_load_timer = QTimer(self)
        self._robot_load_timer.setSingleShot(True)
        self._robot_load_timer.timeout.connect(self._load_robots_now)
        self._last_workspace_url = ""
        self._last_workspace_load_at = 0.0
        self._media_guard_script_installed = False

        self.setWindowTitle("Core-Nexus 截流 / 主动私信机器人控制台")
        # 恢复工作台原始紧凑侧栏比例，右侧浏览器工作区优先获得可用宽度。
        self.resize(1500, 860)
        self.setMinimumSize(1180, 720)
        self.setMinimumSize(720, 620)
        self.setStyleSheet(APP_QSS)
        self.log_dialog = LogDialog(self)
        self._build_ui()
        if os.environ.get("ACS_QTWEBENGINE_CDP_URL"):
            self._log("browser", "INFO", f"右侧工作区 CDP 调试端口已启用：{os.environ.get('ACS_QTWEBENGINE_CDP_URL')}")
        self.apply_runtime_settings()
        self.login_page.set_saved_settings(self.settings)
        self._try_restore_session()

    def _build_ui(self) -> None:
        self.page_stack = QStackedWidget()
        self.setCentralWidget(self.page_stack)
        self.login_page = LoginPage()
        self.login_page.login_requested.connect(self._handle_login)
        self.page_stack.addWidget(self.login_page)
        self.workspace_page = QWidget()
        self.page_stack.addWidget(self.workspace_page)
        root = QVBoxLayout(self.workspace_page)
        root.setContentsMargins(12, 12, 12, 12)
        root.setSpacing(12)
        self.top_bar = TopBar()
        self.top_bar.platform_changed.connect(self._switch_platform)
        self.top_bar.settings_requested.connect(self._open_settings)
        self.top_bar.logout_requested.connect(self._logout)
        root.addWidget(self.top_bar)
        splitter = QSplitter(Qt.Orientation.Horizontal)
        root.addWidget(splitter, 1)
        self.robot_panel = RobotListPanel()
        # 原始窄侧栏：卡片保持紧凑，右侧浏览器工作区优先获得剩余空间。
        self.robot_panel.setMinimumWidth(330)
        self.robot_panel.setMaximumWidth(420)
        self.robot_panel.robot_selected.connect(self._select_robot)
        self.robot_panel.robot_type_changed.connect(self._switch_robot_type)
        self.robot_panel.refresh_requested.connect(self._load_robots)
        self.robot_panel.start_requested.connect(self._start_selected_robot)
        self.robot_panel.stop_requested.connect(lambda rid="": self._stop_process(source="用户点击停止按钮", robot_id=rid))
        self.robot_panel.log_requested.connect(self._show_log_dialog)
        self.robot_panel.export_requested.connect(self._export_processed_works)
        self.robot_panel.continue_sync_requested.connect(self._continue_selected_robot_sync)
        self.robot_panel.recover_requested.connect(self._recover_selected_intercept)
        splitter.addWidget(self.robot_panel)
        self.right_panel = QFrame()
        self.right_panel.setObjectName("RightPanel")
        right_layout = QVBoxLayout(self.right_panel)
        right_layout.setContentsMargins(14, 14, 14, 14)
        right_layout.setSpacing(12)
        self.preview_canvas = QFrame()
        self.preview_canvas.setObjectName("PreviewCanvas")
        canvas_layout = QVBoxLayout(self.preview_canvas)
        canvas_layout.setContentsMargins(0, 0, 0, 0)
        canvas_layout.setSpacing(0)
        self.preview_stack = QStackedWidget()
        self.placeholder = QLabel(
            "请选择左侧机器人卡片，右侧将展示对应的浏览器工作区。\n\n"
            "启动按钮已放置在左侧卡片内；日志和接口请求通过机器人名称旁边的日志按钮查看。\n"
            "工作区会随窗口大小自适应，避免小屏扫码页因尺寸不足反复重排。"
        )
        self.placeholder.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.placeholder.setObjectName("PreviewPlaceholder")
        self.preview_stack.addWidget(self.placeholder)
        # 内嵌 WebEngine 浏览器延迟到真正启动机器人时再初始化。
        # 登录后/平台切换只需要刷新机器人卡片，不应提前拉起 Chromium 进程。
        canvas_layout.addWidget(self.preview_stack)
        right_layout.addWidget(self.preview_canvas, 1)
        splitter.addWidget(self.right_panel)
        splitter.setStretchFactor(1, 1)
        splitter.setSizes([360, 1240])

    def _workspace_key_for_robot(self, robot_id: str = "", robot: dict[str, Any] | None = None) -> str:
        robot_id = str(robot_id or self.selected_robot_id or "").strip()
        robot = robot if robot is not None else self.robot_map.get(robot_id, {})
        platform = str((robot or {}).get("platform") or self.current_platform or "douyin").lower()
        return _login_identity_key(platform, robot_id or "default", _robot_name(robot or {}), fallback="gui_webview")

    def _current_workspace(self) -> Optional[WebviewWorkspace]:
        return self.preview_workspaces.get(self.active_preview_workspace_key or self._embedded_preview_robot_key or "")

    def _sync_active_workspace_aliases(self, workspace: Optional[WebviewWorkspace]) -> None:
        if not workspace:
            self.preview_profile = None
            self.preview_view = None
            self.preview_page = None
            self._platform_cookie_cache = {}
            self._last_workspace_url = ""
            self._last_workspace_load_at = 0.0
            self._media_guard_script_installed = False
            self.active_preview_workspace_key = ""
            self._embedded_preview_robot_key = ""
            self._embedded_preview_initialized = False
            return
        self.preview_profile = workspace.profile
        self.preview_view = workspace.view
        self.preview_page = workspace.page
        self._platform_cookie_cache = workspace.cookie_cache
        self._last_workspace_url = workspace.last_url
        self._last_workspace_load_at = workspace.last_load_at
        self._media_guard_script_installed = workspace.media_guard_script_installed
        self.active_preview_workspace_key = workspace.key
        self._embedded_preview_robot_key = workspace.key
        self._embedded_preview_initialized = True

    def _activate_workspace_for_robot(self, robot_id: str = "", *, create: bool = True, show: bool = True) -> Optional[WebviewWorkspace]:
        robot_id = str(robot_id or self.selected_robot_id or "").strip()
        robot = self.robot_map.get(robot_id, {})
        key = self._workspace_key_for_robot(robot_id, robot)
        workspace = self.preview_workspaces.get(key)
        if not workspace and create:
            workspace = self._create_embedded_preview_workspace(key, robot_id, robot)
        if workspace:
            self._sync_active_workspace_aliases(workspace)
            if show:
                try:
                    self.preview_stack.setCurrentWidget(workspace.view)
                except Exception:
                    pass
        return workspace

    def _ensure_embedded_preview(self) -> bool:
        """Lazily create or switch to the selected robot's visible workspace.

        The previous GUI had one global QWebEngineView and destroyed it whenever
        the operator selected another robot.  Multi-account mode needs one
        persistent workspace per login identity (platform + robot name), so an
        already running robot keeps its visible page when the operator switches
        away and back.
        """
        return bool(self._activate_workspace_for_robot(self.selected_robot_id, create=True, show=True))

    def _teardown_embedded_preview(self) -> None:
        """Close all embedded workspaces.

        This is intentionally no longer called on robot selection.  It is kept
        for logout/shutdown style cleanup only; robot switching must preserve
        each workspace's page, cookies and current URL.
        """
        for workspace in list(self.preview_workspaces.values()):
            try:
                self.preview_stack.removeWidget(workspace.view)
                workspace.view.deleteLater()
            except Exception:
                pass
            try:
                workspace.page.deleteLater()
            except Exception:
                pass
            try:
                workspace.profile.deleteLater()
            except Exception:
                pass
        self.preview_workspaces.clear()
        self._sync_active_workspace_aliases(None)

    def _create_embedded_preview_workspace(self, key: str, robot_id: str, robot: dict[str, Any] | None = None) -> Optional[WebviewWorkspace]:
        """Create a right-side embedded platform workspace for one login identity."""
        if not WEB_ENGINE_AVAILABLE:
            return None
        try:
            robot = robot or self.robot_map.get(robot_id or "", {})
            platform = str((robot or {}).get("platform") or self.current_platform or "douyin").lower()
            profile_root = self.project_root / "profiles" / "_gui_webview" / key
            profile_root.mkdir(parents=True, exist_ok=True)
            profile = QWebEngineProfile(f"interception-preview-{key}", self)  # type: ignore[misc]
            profile.setPersistentStoragePath(str(profile_root))
            profile.setCachePath(str(profile_root / "cache"))

            view = QWebEngineView()  # type: ignore[operator]
            page = QWebEnginePage(profile, self)  # type: ignore[misc]
            workspace = WebviewWorkspace(
                key=key,
                platform=platform,
                view=view,
                page=page,
                profile=profile,
                cookie_cache={},
            )
            self.preview_workspaces[key] = workspace

            cookie_store = profile.cookieStore()
            cookie_store.cookieAdded.connect(lambda cookie, workspace_key=key: self._on_webview_cookie_added(cookie, workspace_key=workspace_key))
            try:
                cookie_store.loadAllCookies()
            except Exception:
                pass
            page.loadFinished.connect(lambda ok, workspace_key=key: self._on_webview_load_finished(ok, workspace_key=workspace_key))
            view.setPage(page)
            view.setMinimumSize(900, 620)
            view.setZoomFactor(1.0)
            try:
                page.setAudioMuted(True)
            except Exception:
                pass
            settings = view.settings()
            settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)  # type: ignore[union-attr]
            settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)  # type: ignore[union-attr]
            settings.setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)  # type: ignore[union-attr]
            settings.setAttribute(QWebEngineSettings.WebAttribute.ScrollAnimatorEnabled, False)  # type: ignore[union-attr]
            for attr_name, attr_value in (
                ("PlaybackRequiresUserGesture", True),
                ("AllowRunningInsecureContent", True),
            ):
                try:
                    attr = getattr(QWebEngineSettings.WebAttribute, attr_name)
                    settings.setAttribute(attr, attr_value)
                except Exception:
                    pass
            self.preview_stack.addWidget(view)
            self._sync_active_workspace_aliases(workspace)
            self._install_webview_media_guard_script(workspace.key)
            return workspace
        except Exception as exc:
            self.preview_workspaces.pop(key, None)
            self._sync_active_workspace_aliases(None)
            self._log("browser", "WARN", f"内嵌浏览器工作区初始化失败，已降级为占位提示：{exc}")
            return None

    def _setup_embedded_preview(self) -> None:
        # Compatibility shim for older call sites.
        self._ensure_embedded_preview()

    def _platform_start_url(self, robot: dict[str, Any] | None = None) -> str:
        platform = str((robot or {}).get("platform") or self.current_platform or "douyin").lower()
        # 右侧工作区启动时只打开平台默认页，不再预打开监听列表第一个账号。
        # 监听账号实际处理顺序由采集进程按随机/顺序配置决定，并通过 TARGET start 事件同步到右侧工作区。
        fallback = {
            "douyin": "https://www.douyin.com/user/self",
            "kuaishou": "https://www.kuaishou.com/",
            "xiaohongshu": "https://www.xiaohongshu.com/",
            "tiktok": "https://www.tiktok.com/",
        }
        return fallback.get(platform, "https://www.douyin.com/user/self")

    def _show_embedded_preview(self, robot: dict[str, Any] | None = None) -> None:
        self._ensure_embedded_preview()
        if not self.preview_view:
            self.placeholder.setText(
                "当前环境未启用 Qt WebEngine，无法在右侧内嵌展示平台页面。\n\n"
                "机器人仍会按截流逻辑执行；如需 UCP 式右侧网页模块，请确认 PySide6 WebEngine 组件已安装。"
            )
            self.preview_stack.setCurrentWidget(self.placeholder)
            return
        try:
            url = self._platform_start_url(robot)
            self._load_workspace_url(url)
            self.top_bar.set_runtime_hint("当前机器人运行中，右侧显示平台工作区")
        except Exception as exc:
            self._log("browser", "WARN", f"打开内嵌平台工作区失败：{exc}")
            self.preview_stack.setCurrentWidget(self.placeholder)

    def _load_workspace_url(self, url: str, force: bool = False, workspace_key: str = "") -> None:
        workspace = self.preview_workspaces.get(workspace_key or self.active_preview_workspace_key) or self._current_workspace()
        if not url or not workspace:
            return
        normalized_url = self._normalize_workspace_url(url)
        now = time.monotonic()
        try:
            current_url = self._normalize_workspace_url(workspace.view.url().toString())
        except Exception:
            current_url = ""
        if (
            not force
            and normalized_url
            and normalized_url == (workspace.last_url or current_url)
            and now - workspace.last_load_at < 15
        ):
            if workspace.key == self.active_preview_workspace_key:
                self.preview_stack.setCurrentWidget(workspace.view)
            self._schedule_webview_media_guard(workspace.key)
            return
        workspace.last_url = normalized_url
        workspace.last_load_at = now
        if workspace.key == self.active_preview_workspace_key:
            self._last_workspace_url = workspace.last_url
            self._last_workspace_load_at = workspace.last_load_at
        workspace.view.load(QUrl(url))
        if workspace.key == self.active_preview_workspace_key:
            self.preview_stack.setCurrentWidget(workspace.view)
        self._schedule_webview_media_guard(workspace.key)

    def _load_workspace_url_for_robot(self, robot_id: str, url: str, *, force: bool = False, show_if_selected: bool = True) -> None:
        if not url:
            return
        show = bool(show_if_selected and robot_id and robot_id == self.selected_robot_id)
        workspace = self._activate_workspace_for_robot(robot_id, create=True, show=show)
        if not workspace:
            return
        self._load_workspace_url(url, force=force, workspace_key=workspace.key)
        if show:
            self._sync_active_workspace_aliases(workspace)
            self.preview_stack.setCurrentWidget(workspace.view)

    def _normalize_workspace_url(self, url: str) -> str:
        text = str(url or "").strip()
        if not text:
            return ""
        return text.rstrip("/")

    def _install_webview_media_guard_script(self, workspace_key: str = "") -> None:
        workspace = self.preview_workspaces.get(workspace_key or self.active_preview_workspace_key) or self._current_workspace()
        if not workspace or not workspace.page or not QWebEngineScript:
            return
        if workspace.media_guard_script_installed:
            return
        try:
            script = QWebEngineScript()  # type: ignore[operator]
            script.setName("interception-media-guard")
            script.setRunsOnSubFrames(True)
            script.setSourceCode(WEBVIEW_MEDIA_GUARD_JS)
            try:
                script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)  # type: ignore[union-attr]
            except Exception:
                pass
            try:
                script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)  # type: ignore[union-attr]
            except Exception:
                pass
            workspace.page.scripts().insert(script)
            workspace.media_guard_script_installed = True
            if workspace.key == self.active_preview_workspace_key:
                self._media_guard_script_installed = True
        except Exception as exc:
            self._log("browser", "WARN", f"安装右侧工作区媒体保护脚本失败：{exc}")

    def _apply_webview_media_guard(self, workspace_key: str = "") -> None:
        workspace = self.preview_workspaces.get(workspace_key or self.active_preview_workspace_key) or self._current_workspace()
        if not workspace or not workspace.page:
            return
        try:
            workspace.page.setAudioMuted(True)
        except Exception:
            pass
        try:
            workspace.page.runJavaScript(WEBVIEW_MEDIA_GUARD_JS)
        except Exception:
            pass

    def _schedule_webview_media_guard(self, workspace_key: str = "") -> None:
        key = workspace_key or self.active_preview_workspace_key
        self._apply_webview_media_guard(key)
        for delay in (500, 1500, 3000, 6000):
            QTimer.singleShot(delay, lambda k=key: self._apply_webview_media_guard(k))

    def _on_webview_load_finished(self, ok: bool, workspace_key: str = "") -> None:
        if not ok:
            return
        workspace = self.preview_workspaces.get(workspace_key or self.active_preview_workspace_key) or self._current_workspace()
        self._schedule_webview_media_guard(workspace.key if workspace else workspace_key)
        if workspace and workspace.profile:
            try:
                workspace.profile.cookieStore().loadAllCookies()
            except Exception:
                pass
        if self._pending_platform_login_robot_id:
            pending_key = self._workspace_key_for_robot(self._pending_platform_login_robot_id, self.robot_map.get(self._pending_platform_login_robot_id, {}))
            if not workspace_key or workspace_key == pending_key:
                self._queue_platform_login_probe(300)

    def _begin_platform_login_gate(self, robot_id: str, title: str, args: list[str] | None = None) -> None:
        """Start asynchronously checking whether the embedded workspace is already logged in.

        The first implementation checked the cookie cache immediately after opening the right-side
        page.  Persistent Qt WebEngine cookies may not be loaded into the signal cache at that exact
        moment, so an already logged-in account could be misjudged as not logged in.  This gate first
        refreshes persistent cookies and waits briefly for the page/cookie store to settle.  Only
        after a few failed probes does it tell the operator to scan/login.
        """
        self._pending_platform_login_robot_id = robot_id
        self._pending_platform_login_args = list(args) if args is not None else None
        self._pending_platform_login_title = title
        self._platform_login_autostart_queued = False
        self._platform_login_probe_attempts = 0
        self._platform_login_probe_token += 1
        self._platform_login_prompt_logged = False
        self._platform_login_soft_auth_detected = False
        self._platform_login_profile_auth_detected = False
        self._platform_login_profile_auth_path = ""
        robot = self.robot_map.get(robot_id, {})
        self.selected_robot_id = robot_id
        self._activate_workspace_for_robot(robot_id, create=True, show=True)
        self.robot_panel.update_card_state(robot_id, False, auth_pending=True)
        self.top_bar.set_runtime_hint("等待右侧平台登录态确认")
        login_key = _login_identity_key(platform=str(robot.get("platform") or self.current_platform or "douyin").lower(), robot_id=robot_id, robot_name=_robot_name(robot), fallback="gui_webview")
        self._log("auth", "INFO", f"正在检测右侧工作区是否已有平台登录态，登录态隔离键：{login_key}。未确认登录前不会启动任务。", robot_id=robot_id)
        if self.preview_profile:
            try:
                self.preview_profile.cookieStore().loadAllCookies()
            except Exception:
                pass
        self._queue_platform_login_probe(800)

    def _queue_platform_login_probe(self, delay_ms: int = 1000) -> None:
        if not self._pending_platform_login_robot_id:
            return
        try:
            if self._platform_login_probe_timer.isActive():
                self._platform_login_probe_timer.stop()
            self._platform_login_probe_timer.start(max(100, int(delay_ms)))
        except Exception:
            QTimer.singleShot(max(100, int(delay_ms)), self._probe_pending_platform_login)

    def _probe_pending_platform_login(self) -> None:
        robot_id = self._pending_platform_login_robot_id
        if not robot_id:
            return
        robot = self.robot_map.get(robot_id, {})
        self._activate_workspace_for_robot(robot_id, create=True, show=(robot_id == self.selected_robot_id))
        platform = str(robot.get("platform") or self.current_platform or "douyin").lower()
        profile_ok, profile_path = self._has_matching_playwright_auth_profile(platform, robot_id, robot)
        self._platform_login_profile_auth_detected = bool(profile_ok)
        self._platform_login_profile_auth_path = profile_path or ""
        if self.preview_profile:
            try:
                self.preview_profile.cookieStore().loadAllCookies()
            except Exception:
                pass
        self._platform_login_probe_attempts += 1
        if self.preview_page:
            script = """
            (() => {
              const norm = s => String(s || '').replace(/\\s+/g, ' ').trim();
              const visible = el => {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 6 && rect.height > 6;
              };
              const bodyText = norm(document.body && document.body.innerText || '');
              const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'));
              const topLoginButton = buttons.some(el => {
                if (!visible(el)) return false;
                const text = norm(el.innerText || el.textContent || el.getAttribute('aria-label') || '');
                const rect = el.getBoundingClientRect();
                return /^(登录|登录\\s*\\/\\s*注册)$/.test(text)
                  || (/登录/.test(text) && rect.top < 220 && rect.right > window.innerWidth * 0.55);
              });
              const hasLoginModal = /扫码登录|验证码登录|密码登录|打开抖音APP|登录后|登录即可|请先登录/.test(bodyText)
                && /登录|手机号|验证码|扫码/.test(bodyText);
              const hasTopAccountAvatar = Array.from(document.querySelectorAll('img, [class*="avatar" i], [class*="Avatar" i], [data-e2e*="user" i]')).some(el => {
                if (!visible(el)) return false;
                const rect = el.getBoundingClientRect();
                return rect.top < 120 && rect.right > window.innerWidth * 0.65;
              });
              const hasOwnProfileControl = /编辑资料|发布作品|创作者服务中心|账号设置|退出登录|我的订单/.test(bodyText);
              const out = {
                href: location.href,
                title: document.title || '',
                bodyTextSample: bodyText.slice(0, 800),
                cookies: document.cookie || '',
                localKeys: [],
                storageValues: [],
                ui: {
                  topLoginButton,
                  hasLoginModal,
                  hasTopAccountAvatar,
                  hasOwnProfileControl,
                  hasProfilePage: String(location.pathname || '').indexOf('/user/') >= 0 || String(location.href || '').indexOf('/user/self') >= 0,
                  hasPostListDom: !!document.querySelector('[data-e2e="user-post-list"], #semiTabpost, #semiTabPanelpost, [aria-labelledby="semiTabpost"], a[href*="/video/"], a[href*="modal_id="]'),
                  hasUserSelfUrl: /\\/user\\/self/.test(location.href),
                  hasLoginText: /登录/.test(bodyText),
                },
              };
              try {
                for (let i = 0; i < window.localStorage.length; i += 1) {
                  const key = window.localStorage.key(i);
                  if (!key) continue;
                  out.localKeys.push(key);
                  if (/login|passport|session|sid|uid|user|auth/i.test(key)) {
                    out.storageValues.push(String(window.localStorage.getItem(key) || '').slice(0, 200));
                  }
                }
              } catch (e) {}
              return out;
            })();
            """
            try:
                token = self._platform_login_probe_token = self._platform_login_probe_token + 1
                self.preview_page.runJavaScript(
                    script,
                    lambda payload, p=platform, t=token: self._handle_platform_login_probe_payload(p, payload, t),
                )
                QTimer.singleShot(1800, lambda p=platform, t=token: self._handle_platform_login_probe_timeout(p, t))
                return
            except Exception as exc:
                self._log("auth", "WARN", f"检测右侧工作区登录态脚本执行失败：{exc}")
        self._continue_platform_login_wait(platform)

    def _handle_platform_login_probe_payload(self, platform: str, payload: Any, token: int = 0) -> None:
        if not self._pending_platform_login_robot_id or self._platform_login_autostart_queued:
            return
        if token and token != self._platform_login_probe_token:
            return
        self._platform_login_probe_token += 1
        login_gate_visible = self._payload_has_platform_login_gate(payload)
        if self._payload_has_platform_auth(platform, payload):
            self._platform_login_soft_auth_detected = True
        cookie_auth = self._has_platform_auth_cookie(platform)
        trust_profile = os.getenv("ACS_GUI_TRUST_PLAYWRIGHT_PROFILE_AUTH", "1").strip().lower() in {"1", "true", "yes", "on"}
        profile_auth = bool(getattr(self, "_platform_login_profile_auth_detected", False)) and trust_profile
        if login_gate_visible:
            self._platform_login_soft_auth_detected = False
            if profile_auth:
                self._log("auth", "INFO", f"右侧工作区显示登录入口，但已检测到同名 Playwright profile 强登录态：{getattr(self, '_platform_login_profile_auth_path', '')}。将按同名规则复用登录态。")
                self._maybe_start_pending_platform_login("已检测到同名 Playwright profile 登录态，准备复用该账号登录态启动任务。")
                return
            if cookie_auth or getattr(self, "_platform_login_profile_auth_detected", False):
                self._log("auth", "WARN", "右侧工作区仍显示登录入口，已忽略非同名或不可确认的本地缓存 Cookie/Profile，继续等待真实登录。")
            self._continue_platform_login_wait(platform)
            return
        if self._platform_login_soft_auth_detected or cookie_auth or profile_auth:
            if profile_auth:
                self._log("auth", "INFO", f"已检测到同名 Playwright profile 登录态：{getattr(self, '_platform_login_profile_auth_path', '')}。")
            self._maybe_start_pending_platform_login("已确认当前机器人名称对应的平台登录态，准备启动任务。")
            return
        self._continue_platform_login_wait(platform)

    def _handle_platform_login_probe_timeout(self, platform: str, token: int) -> None:
        if not self._pending_platform_login_robot_id or self._platform_login_autostart_queued:
            return
        if token != self._platform_login_probe_token:
            return
        self._platform_login_probe_token += 1
        self._log("auth", "WARN", "右侧工作区登录态脚本检测超时，继续下一轮检测。")
        self._continue_platform_login_wait(platform)

    def _payload_has_platform_login_gate(self, payload: Any) -> bool:
        if not isinstance(payload, dict):
            return False
        ui = payload.get("ui") if isinstance(payload.get("ui"), dict) else {}
        if bool(ui.get("topLoginButton") or ui.get("hasLoginModal")):
            return True
        sample = str(payload.get("bodyTextSample") or "")
        return bool(re.search(r"扫码登录|验证码登录|密码登录|打开抖音APP|登录后|登录即可|请先登录", sample, re.IGNORECASE))

    def _payload_has_platform_auth(self, platform: str, payload: Any) -> bool:
        if not isinstance(payload, dict):
            return False
        cookies = str(payload.get("cookies") or "")
        auth_names = PLATFORM_AUTH_COOKIE_NAMES.get(platform) or set()
        for name in auth_names:
            if re.search(rf"(?:^|;\s*){re.escape(name)}=([^;]+)", cookies):
                return True
        local_keys = [str(item) for item in (payload.get("localKeys") or [])]
        local_values = [str(item) for item in (payload.get("storageValues") or [])]
        joined = "\n".join(local_keys + local_values)
        ui = payload.get("ui") if isinstance(payload.get("ui"), dict) else {}
        if platform == "douyin":
            if ui:
                has_login_gate = bool(ui.get("topLoginButton") or ui.get("hasLoginModal"))
                if has_login_gate:
                    return False
                # 公开主页、作品列表、粉丝/关注等在未登录状态也可见，不能作为登录依据。
                # 只接受明确的本人/顶部账号态信号。
                has_logged_in_surface = bool(
                    ui.get("hasUserSelfUrl")
                    or ui.get("hasTopAccountAvatar")
                    or ui.get("hasOwnProfileControl")
                )
                if has_logged_in_surface:
                    return True
            # Douyin 未登录时 localStorage/cookie 中也可能存在 passport_* / odin_tt 等风控字段，
            # 这些不能证明当前账号已登录。这里只接受明确的登录状态字段。
            if self._payload_has_platform_login_gate(payload):
                return False
            return bool(re.search(r"(?:sessionid|uid_tt|sid_guard|sid_tt|passport_auth_status|login_status\s*[:=]\s*(?:1|true)|is_login\s*[:=]\s*(?:1|true))", joined, re.IGNORECASE))
        if platform == "xiaohongshu":
            return bool(re.search(r"web_session|user|login|auth", joined, re.IGNORECASE))
        if platform == "kuaishou":
            return bool(re.search(r"web_st|api_st|user|login|auth", joined, re.IGNORECASE))
        return bool(re.search(r"session|sid|uid|user|login|auth", joined, re.IGNORECASE))

    def _continue_platform_login_wait(self, platform: str) -> None:
        if not self._pending_platform_login_robot_id:
            return
        if self.current_robot_type == "INTERCEPT" and self._platform_login_soft_auth_detected:
            self._maybe_start_pending_platform_login(
                "右侧工作区页面已呈现登录态，但强 Cookie 无法导出；继续启动 Playwright 运行时承接采集。"
            )
            return
        # First allow Qt WebEngine time to restore persistent cookies. Only after several probes
        # should the UI conclude that the operator may need to scan/login again.  Interception and
        # private-message robots now follow the same strict rule: only the same robot name may reuse
        # a prior login state; different names must scan/login in their own isolated workspace.
        if self._pending_platform_login_robot_id:
            self.robot_panel.update_card_state(self._pending_platform_login_robot_id, False, auth_pending=True)
        if self._platform_login_probe_attempts >= 3 and not self._platform_login_prompt_logged:
            self._platform_login_prompt_logged = True
            self._log("auth", "INFO", "当前机器人名称尚未检测到平台登录态；请先在右侧工作区完成扫码/登录。未确认登录前不会启动任务。", robot_id=self._pending_platform_login_robot_id)
        self.top_bar.set_runtime_hint("等待右侧平台登录态确认")
        self._queue_platform_login_probe(1500)

    def _maybe_start_pending_platform_login(self, reason: str) -> None:
        if not self._pending_platform_login_robot_id or self._platform_login_autostart_queued:
            return
        self._platform_login_autostart_queued = True
        try:
            if self._platform_login_probe_timer.isActive():
                self._platform_login_probe_timer.stop()
        except Exception:
            pass
        robot_id = self._pending_platform_login_robot_id
        title = self._pending_platform_login_title or f"启动截流机器人：{_robot_name(self.robot_map.get(robot_id, {}))}"
        self._log("auth", "INFO", reason, robot_id=robot_id)
        self._log("auth", "INFO", "已检测到右侧工作区平台登录态，准备启动采集。", robot_id=robot_id)
        pending_args = list(self._pending_platform_login_args) if self._pending_platform_login_args is not None else None
        QTimer.singleShot(500, lambda rid=robot_id, t=title, a=pending_args: self._start_robot_after_platform_ready(rid, args=a, title=t))

    def apply_runtime_settings(self) -> None:
        self.log_dialog.set_feature_visibility(
            gui_log_enabled=self.settings.gui_log_enabled,
            interface_trace_enabled=self.settings.interface_trace_enabled,
        )
        active_log_robot_id = getattr(self, "log_dialog_robot_id", "")
        self.log_dialog.set_lines(self._log_lines_for_robot(active_log_robot_id) if active_log_robot_id else list(self.log_buffer))
        self.log_dialog.set_request_entries(list(self.request_buffer))

    def _goto_login(self) -> None:
        self.page_stack.setCurrentWidget(self.login_page)
        self.login_page.set_loading(False)
        self.login_page.set_message("接口地址从配置读取；登录后会自动判断租户并进入工作台。")
        self.top_bar.set_session(None)
        if self.isMaximized() or self.isFullScreen():
            self.showNormal()
        self.setMinimumSize(720, 620)
        self.resize(760, 680)

    def _goto_workspace(self) -> None:
        self.setMinimumSize(1080, 720)
        self.page_stack.setCurrentWidget(self.workspace_page)
        self.top_bar.set_session(self.session)
        self.top_bar.set_platform(self.current_platform)
        self.top_bar.page_title.setText("截流机器人工作台")
        self.top_bar.set_runtime_hint("请选择左侧机器人并启动")
        if not self.isMaximized():
            self.showMaximized()

    def _try_restore_session(self) -> None:
        if not self.settings.auto_restore_session:
            self._goto_login()
            return
        cache_path = self._token_cache_path()
        if not cache_path.exists():
            self._goto_login()
            return
        try:
            session = load_session(cache_path)
            if not session.tenant_id:
                raise RuntimeError("本地登录缓存缺少租户信息，请重新登录。")
            self.client = CoreNexusClient.from_session(session, request_logger=self._on_request)
            self.client.me()
            self.session = self.client.session
            self._goto_workspace()
            self._log("auth", "INFO", "已恢复 Core Nexus 登录状态。")
            self._load_robots()
        except Exception as exc:
            self._log("auth", "WARN", f"恢复登录状态失败，已回到登录页：{exc}")
            try:
                cache_path.unlink(missing_ok=True)
            except Exception:
                pass
            self._goto_login()

    def _handle_login(self, username: str, password: str, remember: bool) -> None:
        if not username or not password:
            self.login_page.set_message("请填写账号和密码。", error=True)
            QMessageBox.warning(self, "提示", "请填写账号和密码。")
            return
        base_url = (self.settings.api_base_url or "http://localhost:3000").strip()
        if not base_url:
            self.login_page.set_message("请先在配置中设置 core-nexus 后端地址。", error=True)
            QMessageBox.warning(self, "提示", "请先在配置中设置 core-nexus 后端地址。")
            return
        self.login_page.set_loading(True)
        try:
            client = CoreNexusClient(base_url, request_logger=self._on_request)
            session = client.login(username, password)
            choices = _tenant_choices_from_session(session)
            if len(choices) > 1:
                dialog = TenantSelectDialog(choices, self)
                if dialog.exec() != QDialog.DialogCode.Accepted:
                    self.login_page.set_message("已返回登录页，请选择租户后再进入工作台。")
                    return
                tenant_id = dialog.selected_tenant_id()
            elif len(choices) == 1:
                tenant_id = choices[0].tenant_id
            else:
                self.login_page.set_message("当前账号暂无租户，请联系管理员处理。", error=True)
                QMessageBox.warning(self, "暂无租户", "当前账号暂无租户，请联系管理员处理。")
                self._log("auth", "WARN", f"账号 {username} 登录成功但未返回可用租户。")
                return
            self.client = client
            self.session = session
            self.settings.username = username
            self.settings.password = password
            self.settings.remember_credentials = remember
            self._complete_tenant_selection(tenant_id)
        except Exception as exc:
            self.login_page.set_message(f"登录失败：{exc}", error=True)
            QMessageBox.critical(self, "登录失败", str(exc))
            self._log("auth", "ERROR", f"登录失败：{exc}")
        finally:
            self.login_page.set_loading(False)

    def _complete_tenant_selection(self, tenant_id: str) -> None:
        tenant_id = str(tenant_id or "").strip()
        if not tenant_id:
            self.login_page.set_message("当前账号暂无租户，请联系管理员处理。", error=True)
            QMessageBox.warning(self, "暂无租户", "当前账号暂无租户，请联系管理员处理。")
            return
        if not self.client:
            QMessageBox.critical(self, "登录状态异常", "Core Nexus 客户端未初始化，请重新登录。")
            self._goto_login()
            return
        try:
            session = self.client.switch_tenant(tenant_id)
            self.session = session
            self.settings.tenant_id = tenant_id
            self.settings_store.save(self.settings)
            save_session(self._token_cache_path(), session)
            self.login_page.set_message(f"登录成功，正在加载{self._robot_type_label()}。")
            self._goto_workspace()
            self._log("auth", "INFO", f"租户确认完成：{_tenant_name_from_session(session) or tenant_id}")
            self._load_robots()
        except Exception as exc:
            self.login_page.set_message(f"租户切换失败：{exc}", error=True)
            QMessageBox.critical(self, "租户切换失败", str(exc))
            self._log("auth", "ERROR", f"租户切换失败：{exc}")

    def _logout(self) -> None:
        answer = QMessageBox.question(self, "退出登录", "确认退出当前 Core Nexus 登录吗？\n平台授权目录不会被清理。")
        if answer != QMessageBox.StandardButton.Yes:
            return
        if self._has_running_processes():
            self._stop_all_processes(source="退出登录")
        try:
            if self.client:
                self.client.logout()
        except Exception:
            pass
        try:
            self._token_cache_path().unlink(missing_ok=True)
        except Exception:
            pass
        self.client = None
        self.session = None
        self.robots = []
        self.robot_map = {}
        self.selected_robot_id = ""
        self.running_robot_id = ""
        self.running_robot_ids.clear()
        self._teardown_embedded_preview()
        self.robot_panel.set_robots([])
        self._goto_login()
        self._log("auth", "INFO", "已退出登录。")

    def _robot_type_label(self) -> str:
        return "主动私信机器人" if self.current_robot_type == "LEAD_PRIVATE_MESSAGE" else "截流机器人"

    def _switch_robot_type(self, robot_type: str) -> None:
        robot_type = "LEAD_PRIVATE_MESSAGE" if robot_type == "LEAD_PRIVATE_MESSAGE" else "INTERCEPT"
        if robot_type == self.current_robot_type:
            return
        self.current_robot_type = robot_type
        self.selected_robot_id = ""
        self.preview_stack.setCurrentWidget(self.placeholder)
        self.placeholder.setText(f"正在切换到{self._robot_type_label()}列表。")
        self._log("system", "INFO", f"切换机器人类型：{self._robot_type_label()}")
        self._load_robots(force=True)

    def _switch_platform(self, platform: str) -> None:
        if platform == self.current_platform:
            return
        self.current_platform = platform
        self.top_bar.set_platform(platform)
        self.selected_robot_id = ""
        self.preview_stack.setCurrentWidget(self.placeholder)
        self.placeholder.setText(
            "请选择左侧机器人卡片，右侧将展示对应的浏览器工作区。\n\n"
            f"当前平台已切换，正在加载{self._robot_type_label()}。"
        )
        self._log("system", "INFO", f"切换平台：{PLATFORM_LABEL.get(platform, platform)}")
        self._load_robots()

    def _load_robots(self, force: bool = False) -> None:
        """Debounced robot reload entry.

        Qt selection/state changes and repeated button clicks can trigger a burst of reload
        requests.  Only one backend list request should be issued for the burst; otherwise
        the GUI log looks like it is automatically refreshing many times and the left card
        state may flicker.
        """
        if not self.client:
            return
        if self._robots_loading:
            self._robot_load_queued = True
            return
        if self._robot_load_timer.isActive():
            return
        if force:
            self._load_robots_now()
            return
        now = time.monotonic()
        delay_ms = 120 if now - self._last_robot_load_started_at > 1.2 else 900
        self._robot_load_timer.start(delay_ms)

    def _load_robots_now(self) -> None:
        if not self.client or self._robots_loading:
            return
        self._robots_loading = True
        self._robot_load_queued = False
        self._last_robot_load_started_at = time.monotonic()
        try:
            self.robot_panel.set_refreshing(True)
        except Exception:
            pass
        try:
            self.top_bar.set_runtime_hint(f"正在从后端加载{self._robot_type_label()}...")
            payload = self.client.list_robots(platform=self.current_platform, robot_type=self.current_robot_type, page_size=100)
            robots = _extract_robot_items(payload)
            self.robots = robots
            self.robot_map = {_robot_id(item): item for item in robots if _robot_id(item)}
            previous = self.selected_robot_id if self.selected_robot_id in self.robot_map else ""
            self.robot_panel.set_robots(self.robots, selected_id=previous, running_ids=self.running_robot_ids)
            if self.robots:
                target_id = previous or _robot_id(self.robots[0])
                self._select_robot(target_id)
                self.top_bar.set_runtime_hint(f"已加载 {len(self.robots)} 个{self._robot_type_label()}")
            else:
                self.selected_robot_id = ""
                self.placeholder.setText(
                    f"当前平台暂无{self._robot_type_label()}。\n\n"
                    f"请确认后端机器人 type={self.current_robot_type}，且 platform 与当前平台一致。"
                )
                self.preview_stack.setCurrentWidget(self.placeholder)
                self.top_bar.set_runtime_hint(f"当前平台暂无{self._robot_type_label()}")
            self._log("robot", "INFO", f"已加载机器人 {len(self.robots)} 个，平台={self.current_platform}")
        except Exception as exc:
            QMessageBox.critical(self, "加载失败", f"获取机器人列表失败：{exc}")
            self._log("robot", "ERROR", f"获取机器人列表失败：{exc}")
            self.top_bar.set_runtime_hint("机器人加载失败")
        finally:
            self._robots_loading = False
            try:
                self.robot_panel.set_refreshing(False)
            except Exception:
                pass
            if self._robot_load_queued:
                self._robot_load_queued = False
                self._robot_load_timer.start(900)

    def _is_robot_process_running(self, robot_id: str) -> bool:
        process = self.processes.get(str(robot_id or ""))
        return bool(process and process.state() != QProcess.ProcessState.NotRunning)

    def _has_running_processes(self) -> bool:
        return any(process.state() != QProcess.ProcessState.NotRunning for process in list(self.processes.values()))

    def _running_count(self) -> int:
        return sum(1 for process in list(self.processes.values()) if process.state() != QProcess.ProcessState.NotRunning)

    def _runtime_hint_text(self) -> str:
        count = self._running_count()
        if count <= 0:
            return "机器人未运行，可选择左侧卡片启动"
        return f"当前有 {count} 个机器人并发运行中"

    def _sync_legacy_running_id(self) -> None:
        self.running_robot_id = next(iter(self.running_robot_ids), "")

    def _select_robot(self, robot_id: str) -> None:
        if not robot_id or robot_id not in self.robot_map:
            return
        self.selected_robot_id = robot_id
        self._process_robot_types[robot_id] = self.current_robot_type
        self.robot_panel.set_selected_robot(robot_id)
        robot = self.robot_map[robot_id]
        name = _robot_name(robot)
        self.top_bar.page_title.setText(f"{self._robot_type_label()} · {name}")
        workspace = self._activate_workspace_for_robot(robot_id, create=False, show=True)
        if workspace:
            self._schedule_webview_media_guard(workspace.key)
            if self._is_robot_process_running(robot_id):
                self.top_bar.set_runtime_hint(self._runtime_hint_text())
            else:
                self.top_bar.set_runtime_hint("已切换到该机器人的独立浏览器工作区")
            return
        if self._is_robot_process_running(robot_id):
            # Running robots should normally already have a workspace.  Create a
            # late workspace only as a defensive fallback, without stealing login
            # state from other robot names.
            workspace = self._activate_workspace_for_robot(robot_id, create=True, show=True)
            if workspace:
                url = self._platform_start_url(robot)
                self._load_workspace_url(url, workspace_key=workspace.key)
                self.top_bar.set_runtime_hint(self._runtime_hint_text())
                return
            self.placeholder.setText(
                f"{name} 正在运行。\n\n"
                "当前环境未能创建右侧浏览器工作区；日志和接口请求可通过左侧卡片的日志按钮查看。"
            )
            self.top_bar.set_runtime_hint(self._runtime_hint_text())
        else:
            self.placeholder.setText(
                f"已选择：{name}\n\n"
                f"请点击左侧卡片中的“启动”按钮开始执行{self._robot_type_label()}任务。\n"
                "启动后会创建该机器人自己的浏览器工作区；同名机器人才复用登录态。"
            )
            self.top_bar.set_runtime_hint("当前机器人未启动；请使用左侧卡片中的按钮进行启动")
        self.preview_stack.setCurrentWidget(self.placeholder)

    def _start_selected_robot(self, robot_id: str | None = None) -> None:
        robot_id = robot_id or self.selected_robot_id
        if not robot_id:
            QMessageBox.warning(self, "提示", f"请先选择要启动的{self._robot_type_label()}。")
            return
        self.selected_robot_id = robot_id
        self._process_robot_types[robot_id] = self.current_robot_type
        self.robot_panel.set_selected_robot(robot_id)
        if self._is_robot_process_running(robot_id):
            QMessageBox.warning(self, "提示", "当前机器人已经在运行，请先停止或等待完成。")
            return
        if self._pending_platform_login_robot_id:
            QMessageBox.warning(self, "提示", "当前正在等待右侧平台扫码/登录，请先完成登录或停止当前任务。")
            return
        cache_path = self._token_cache_path()
        if not cache_path.exists():
            QMessageBox.warning(self, "提示", "本地没有 Core Nexus 登录缓存，请重新登录。")
            return

        robot = self.robot_map.get(robot_id, {})
        self._show_embedded_preview(robot)
        title = f"启动{self._robot_type_label()}：{_robot_name(robot)}"

        if self.preview_view:
            self._begin_platform_login_gate(robot_id, title)
            return

        self._start_robot_after_platform_ready(robot_id, title=title)

    def _continue_selected_robot_sync(self, robot_id: str | None = None) -> None:
        robot_id = robot_id or self.selected_robot_id
        if not robot_id:
            QMessageBox.warning(self, "提示", "请先选择要继续同步的截流机器人。")
            return
        if self.current_robot_type != "INTERCEPT":
            QMessageBox.warning(self, "提示", "继续同步只适用于截流机器人。")
            return
        self.selected_robot_id = robot_id
        self._process_robot_types[robot_id] = "INTERCEPT"
        self.robot_panel.set_selected_robot(robot_id)
        if self._is_robot_process_running(robot_id):
            QMessageBox.warning(self, "提示", "当前机器人已经在运行，请先停止或等待完成。")
            return
        cache_path = self._token_cache_path()
        if not cache_path.exists():
            QMessageBox.warning(self, "提示", "本地没有 Core Nexus 登录缓存，请重新登录。")
            return
        robot = self.robot_map.get(robot_id, {})
        title = f"继续同步截流数据：{_robot_name(robot)}"
        args = self._common_args() + [
            "continue-intercept-sync",
            "--robot-id", robot_id,
            "--token-cache-path", str(cache_path),
        ]
        if self.settings.api_base_url:
            args.extend(["--core-api-base-url", self.settings.api_base_url])
        self._reset_robot_log_buffer(robot_id)
        self._start_process(args, title=title, phase="sync", robot_id=robot_id)

    def _recover_selected_intercept(self, robot_id: str | None = None) -> None:
        robot_id = robot_id or self.selected_robot_id
        if not robot_id:
            QMessageBox.warning(self, "提示", "请先选择要恢复的截流机器人。")
            return
        if self.current_robot_type != "INTERCEPT":
            QMessageBox.warning(self, "提示", "恢复任务只适用于截流机器人。")
            return
        if self._is_robot_process_running(robot_id):
            QMessageBox.warning(self, "提示", "当前机器人仍在运行，请先等待安全停止完成。")
            return
        cache_path = self._token_cache_path()
        if not cache_path.exists():
            QMessageBox.warning(self, "提示", "本地没有 Core Nexus 登录缓存，请重新登录。")
            return
        self.selected_robot_id = robot_id
        self._process_robot_types[robot_id] = "INTERCEPT"
        self.robot_panel.set_selected_robot(robot_id)
        robot = self.robot_map.get(robot_id, {})
        title = f"恢复未完成截流任务：{_robot_name(robot)}"
        args = self._common_args() + [
            "recover-intercept-run",
            "--robot-id", robot_id,
            "--token-cache-path", str(cache_path),
            "--browser-name", self.settings.browser_name or "chromium",
        ]
        if self.settings.api_base_url:
            args.extend(["--core-api-base-url", self.settings.api_base_url])
        self._reset_robot_log_buffer(robot_id)
        if self.preview_view:
            self._begin_platform_login_gate(robot_id, title, args=args)
            return
        self._run_with_runtime_guard(args, title=title, browser_name=self.settings.browser_name or "chromium", robot_id=robot_id)

    def _build_robot_run_args(self, robot_id: str, storage_state_path: Optional[Path] = None) -> list[str]:
        cache_path = self._token_cache_path()
        robot_type = self._process_robot_types.get(robot_id) or self.current_robot_type
        command = "run-private-message-robot" if robot_type == "LEAD_PRIVATE_MESSAGE" else "run-core-robot"
        args = self._common_args() + [
            command,
            "--robot-id", robot_id,
            "--token-cache-path", str(cache_path),
            "--browser-name", self.settings.browser_name or "chromium",
        ]
        if robot_type == "LEAD_PRIVATE_MESSAGE":
            args.extend(["--robot-name", _robot_name(self.robot_map.get(robot_id, {}))])
        # GUI 模式下不再额外弹出 Playwright 可见浏览器。
        # 右侧 Qt WebEngine 工作区作为唯一可见的平台浏览器；采集进程使用
        # 后台无界面实例读取同一份登录态，避免桌面出现第二个浏览器窗口。
        # 如需排查 DOM/懒加载，可在启动 GUI 前设置 ACS_GUI_EXTERNAL_BROWSER=1，
        # 临时恢复可见采集窗口。
        external_browser = os.getenv("ACS_GUI_EXTERNAL_BROWSER", "0").strip().lower() in {"1", "true", "yes", "on"}
        if robot_type == "LEAD_PRIVATE_MESSAGE":
            # 主动私信已经跑通 Playwright profile 登录态后，默认后台无界面执行，
            # 避免桌面额外弹出 Chromium 窗口。需要现场调试时可设置 ACS_PM_VISIBLE_BROWSER=1
            # 或 ACS_PM_HEADLESS=0 临时恢复可见窗口。
            pm_visible = os.getenv("ACS_PM_VISIBLE_BROWSER", "0").strip().lower() in {"1", "true", "yes", "on"}
            pm_headless_env = os.getenv("ACS_PM_HEADLESS", "1").strip().lower()
            pm_headless = pm_headless_env not in {"0", "false", "no", "off"}
            if pm_headless and not pm_visible:
                args.append("--headless")
        elif not external_browser:
            args.append("--headless")
        if robot_type == "INTERCEPT":
            args.append("--ignore-run-cycle")
        else:
            args.extend(["--poll-interval-sec", "10", "--max-empty-rounds", "3"])
        if storage_state_path:
            args.extend(["--storage-state-path", str(storage_state_path)])
        if self.settings.api_base_url:
            args.extend(["--core-api-base-url", self.settings.api_base_url])
        return args

    def _start_robot_after_platform_ready(self, robot_id: str, args: list[str] | None = None, title: str | None = None) -> None:
        if self._is_robot_process_running(robot_id):
            return
        self._pending_platform_login_robot_id = ""
        self._pending_platform_login_args = None
        self._pending_platform_login_title = ""
        self._platform_login_autostart_queued = False
        self.selected_robot_id = robot_id
        run_title = title or f"启动{self._robot_type_label()}：{_robot_name(self.robot_map.get(robot_id, {}))}"

        if args is not None:
            self._log("auth", "INFO", "平台登录态已就绪，开始启动采集任务。")
            self._run_with_runtime_guard(args, title=run_title, browser_name=self.settings.browser_name or "chromium", robot_id=robot_id)
            return

        self._log("auth", "INFO", "平台登录态已就绪，正在导出右侧工作区登录态。")
        self._export_webview_storage_state_async(
            robot_id,
            lambda storage_state_path, rid=robot_id, t=run_title: self._start_robot_with_storage_state(rid, t, storage_state_path),
        )

    def _start_robot_with_storage_state(self, robot_id: str, title: str, storage_state_path: Optional[Path]) -> None:
        if self._is_robot_process_running(robot_id):
            return
        run_args = self._build_robot_run_args(robot_id, storage_state_path=storage_state_path)
        self._log("auth", "INFO", "平台登录态已就绪，开始启动采集任务。")
        self._run_with_runtime_guard(run_args, title=title, browser_name=self.settings.browser_name or "chromium", robot_id=robot_id)

    def _cookie_key(self, cookie: Any) -> str:
        data = self._web_cookie_to_dict(cookie)
        return "|".join([data.get("domain", ""), data.get("path", "/"), data.get("name", "")])

    def _web_cookie_to_dict(self, cookie: Any) -> dict[str, Any]:
        def _bytes_to_str(value: Any) -> str:
            try:
                return bytes(value).decode("utf-8", errors="ignore")
            except Exception:
                return str(value or "")

        name = _bytes_to_str(cookie.name())
        value = _bytes_to_str(cookie.value())
        domain = str(cookie.domain() or "")
        path = str(cookie.path() or "/")
        expires = -1
        try:
            expiration = cookie.expirationDate()
            if expiration and expiration.isValid():
                expires = int(expiration.toSecsSinceEpoch())
        except Exception:
            expires = -1
        same_site = None
        try:
            raw_same_site = str(cookie.sameSitePolicy()).split(".")[-1]
            same_site_map = {"Default": "Lax", "Lax": "Lax", "Strict": "Strict", "None_": "None", "None": "None"}
            same_site = same_site_map.get(raw_same_site)
        except Exception:
            same_site = None
        data: dict[str, Any] = {
            "name": name,
            "value": value,
            "domain": domain,
            "path": path,
            "expires": expires,
            "httpOnly": bool(cookie.isHttpOnly()),
            "secure": bool(cookie.isSecure()),
        }
        if same_site:
            data["sameSite"] = same_site
        return data

    def _platform_for_cookie(self, cookie_data: dict[str, Any]) -> str | None:
        domain = str(cookie_data.get("domain") or "").lower()
        for platform, hint in PLATFORM_DOMAIN_HINTS.items():
            if hint in domain:
                return platform
        return None

    def _has_matching_playwright_auth_profile(self, platform: str, robot_id: str, robot: Dict[str, Any]) -> tuple[bool, str]:
        """Return whether an existing Playwright profile can prove platform login.

        The right-side Qt WebEngine workspace often cannot export HttpOnly Douyin login cookies.
        Interception and private-message execution, however, use Playwright persistent profiles.
        When a matching profile already has strong login cookies, the GUI login gate should not
        block startup just because the embedded workspace cookie cache only exposes weak cookies.
        """
        platform = (platform or self.current_platform or "douyin").lower()
        platform_dir = self.project_root / "profiles" / platform
        if not platform_dir.exists():
            return False, ""
        robot_name_key = _normalize_robot_name_key(_robot_name(robot))
        auth = robot.get("auth") if isinstance(robot.get("auth"), dict) else {}
        account_alias = auth.get("accountName") or auth.get("accountUid") or robot.get("authName") or robot.get("accountAlias") or ""
        expected_key = _safe_runtime_key(str(robot_id or account_alias or _robot_name(robot)), fallback="core_robot")
        allow_legacy_id = os.getenv("ACS_ALLOW_LEGACY_ROBOT_ID_PROFILE_REUSE", "0").strip().lower() in {"1", "true", "yes", "on"}
        candidates: list[tuple[int, float, Path, str]] = []
        for path in platform_dir.iterdir():
            if not path.is_dir() or path.name.startswith("_"):
                continue
            meta = self._read_playwright_profile_metadata(path)
            meta_name_key = str(meta.get("robotNameKey") or "")
            meta_robot_id = str(meta.get("robotId") or "")
            score = 0
            reason = ""
            # Strict login identity: robot display name has priority and is the only
            # cross-type reuse rule.  Different names must not reuse each other's
            # cookies.  Same robotId is accepted only when metadata has no conflicting
            # name, so a renamed robot also gets a fresh login identity by default.
            if robot_name_key and meta_name_key and meta_name_key == robot_name_key:
                score = 100
                reason = "robotName"
            elif meta_robot_id and meta_robot_id == str(robot_id) and (not meta_name_key or meta_name_key == robot_name_key):
                score = 80
                reason = "robotId"
            elif path.name == expected_key and (not meta_name_key or meta_name_key == robot_name_key):
                score = 70
                reason = "expectedKey"
            elif allow_legacy_id and not meta and path.name.startswith(str(robot_id)):
                score = 50
                reason = "legacyRobotId"
            if score <= 0:
                continue
            if self._playwright_profile_has_strong_auth(path, platform):
                try:
                    mtime = path.stat().st_mtime
                except Exception:
                    mtime = 0
                candidates.append((score, mtime, path, reason))
        if not candidates:
            return False, ""
        candidates.sort(key=lambda row: (row[0], row[1]), reverse=True)
        _score, _mtime, path, reason = candidates[0]
        return True, f"{path} ({reason})"

    def _read_playwright_profile_metadata(self, profile_dir: Path) -> Dict[str, Any]:
        try:
            data = json.loads((profile_dir / ".acs_profile_meta.json").read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _playwright_profile_has_strong_auth(self, profile_dir: Path, platform: str) -> bool:
        names = PLATFORM_AUTH_COOKIE_NAMES.get((platform or "douyin").lower()) or set()
        if not names:
            return False
        cookie_paths = [
            profile_dir / "Default" / "Network" / "Cookies",
            profile_dir / "Default" / "Cookies",
            profile_dir / "Network" / "Cookies",
            profile_dir / "Cookies",
        ]
        try:
            for candidate in profile_dir.rglob("Cookies"):
                if candidate not in cookie_paths:
                    cookie_paths.append(candidate)
        except Exception:
            pass
        domain_hint = PLATFORM_DOMAIN_HINTS.get((platform or "douyin").lower(), "")
        for cookie_db in cookie_paths:
            if not cookie_db.exists() or not cookie_db.is_file():
                continue
            tmp_path = None
            try:
                fd, tmp_name = tempfile.mkstemp(prefix="acs_cookie_probe_", suffix=".sqlite")
                os.close(fd)
                tmp_path = Path(tmp_name)
                shutil.copy2(cookie_db, tmp_path)
                conn = sqlite3.connect(str(tmp_path))
                try:
                    try:
                        rows = conn.execute("SELECT name, host_key, value, encrypted_value, expires_utc FROM cookies").fetchall()
                    except Exception:
                        rows = [(name, host_key, value, b"", 0) for name, host_key, value in conn.execute("SELECT name, host_key, value FROM cookies").fetchall()]
                finally:
                    conn.close()
                now_chrome = int((time.time() + 11644473600) * 1000000)
                for name, host_key, value, encrypted_value, expires_utc in rows:
                    if str(name or "") not in names:
                        continue
                    if domain_hint and domain_hint not in str(host_key or "").lower():
                        continue
                    try:
                        expires_raw = int(expires_utc or 0)
                    except Exception:
                        expires_raw = 0
                    if expires_raw > 0 and expires_raw <= now_chrome:
                        continue
                    has_value = bool(str(value or ""))
                    try:
                        has_encrypted_value = bool(encrypted_value and len(encrypted_value) > 0)
                    except Exception:
                        has_encrypted_value = bool(encrypted_value)
                    if has_value or has_encrypted_value:
                        return True
            except Exception:
                continue
            finally:
                if tmp_path:
                    try:
                        tmp_path.unlink(missing_ok=True)
                    except Exception:
                        pass
        return False

    def _on_webview_cookie_added(self, cookie: Any, workspace_key: str = "") -> None:
        try:
            data = self._web_cookie_to_dict(cookie)
        except Exception:
            return
        platform = self._platform_for_cookie(data)
        if not platform:
            return
        workspace = self.preview_workspaces.get(workspace_key or self.active_preview_workspace_key) or self._current_workspace()
        cache = workspace.cookie_cache if workspace else self._platform_cookie_cache
        cache.setdefault(platform, {})[self._cookie_key(cookie)] = data
        if workspace and workspace.key == self.active_preview_workspace_key:
            self._platform_cookie_cache = workspace.cookie_cache
        if self._pending_platform_login_robot_id:
            pending_key = self._workspace_key_for_robot(self._pending_platform_login_robot_id, self.robot_map.get(self._pending_platform_login_robot_id, {}))
            if not workspace or workspace.key == pending_key:
                # Cookie 变更只能触发复检，不能直接启动。未登录页面也可能残留旧 Cookie，
                # 必须结合右侧页面 UI 判断，避免“显示登录按钮但任务已启动”。
                self._queue_platform_login_probe(300)

    def _has_platform_auth_cookie(self, platform: str, workspace_key: str = "") -> bool:
        platform = (platform or self.current_platform or "douyin").lower()
        if workspace_key:
            workspace = self.preview_workspaces.get(workspace_key)
        elif self._pending_platform_login_robot_id:
            workspace = self.preview_workspaces.get(self._workspace_key_for_robot(self._pending_platform_login_robot_id, self.robot_map.get(self._pending_platform_login_robot_id, {})))
        else:
            workspace = self._current_workspace()
        cache = workspace.cookie_cache if workspace else self._platform_cookie_cache
        names = PLATFORM_AUTH_COOKIE_NAMES.get(platform) or set()
        if not names:
            return bool(cache.get(platform))
        cookies = cache.get(platform, {})
        now = int(time.time())
        for item in cookies.values():
            name = str(item.get("name") or "")
            value = str(item.get("value") or "")
            try:
                expires = int(item.get("expires") or -1)
            except Exception:
                expires = -1
            if expires > 0 and expires <= now:
                continue
            if name in names and value and value.lower() not in {"0", "false", "null", "undefined"}:
                return True
        return False

    def _export_webview_storage_state_async(self, robot_id: str, callback) -> None:
        workspace = self._activate_workspace_for_robot(robot_id, create=True, show=(robot_id == self.selected_robot_id))
        if not workspace or not workspace.view or not workspace.page:
            callback(self._write_webview_storage_state(robot_id, origin="", local_storage=[]))
            return
        url = workspace.view.url()
        origin = ""
        if url and url.scheme() and url.host():
            origin = f"{url.scheme()}://{url.host()}"
            if url.port() and url.port() not in {-1, 80, 443}:
                origin = f"{origin}:{url.port()}"
        script = """
        (() => {
          const items = [];
          try {
            for (let i = 0; i < window.localStorage.length; i += 1) {
              const name = window.localStorage.key(i);
              if (name) items.push({ name, value: window.localStorage.getItem(name) || '' });
            }
          } catch (e) {}
          return items;
        })();
        """
        try:
            workspace.page.runJavaScript(
                script,
                lambda items, rid=robot_id, org=origin: callback(self._write_webview_storage_state(rid, origin=org, local_storage=items)),
            )
        except Exception as exc:
            self._log("auth", "WARN", f"读取右侧工作区 localStorage 失败，仅导出 Cookie：{exc}")
            callback(self._write_webview_storage_state(robot_id, origin="", local_storage=[]))

    def _write_webview_storage_state(self, robot_id: str, origin: str = "", local_storage: Any = None) -> Optional[Path]:
        robot = self.robot_map.get(robot_id, {})
        platform = str(robot.get("platform") or self.current_platform or "douyin").lower()
        workspace = self.preview_workspaces.get(self._workspace_key_for_robot(robot_id, robot))
        cache = workspace.cookie_cache if workspace else self._platform_cookie_cache
        cookies = list((cache.get(platform) or {}).values())
        if not cookies and not local_storage:
            return None
        state_dir = self.project_root / "state" / "gui_webview"
        state_dir.mkdir(parents=True, exist_ok=True)
        safe_robot_id = re.sub(r"[^A-Za-z0-9_-]+", "_", robot_id).strip("_") or "robot"
        path = state_dir / f"{platform}_{safe_robot_id}_storage_state.json"
        local_items = []
        if isinstance(local_storage, list):
            for item in local_storage:
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name") or "")
                value = str(item.get("value") or "")
                if name:
                    local_items.append({"name": name, "value": value})
        origins = []
        if origin and local_items:
            origins.append({"origin": origin, "localStorage": local_items})
        path.write_text(json.dumps({"cookies": cookies, "origins": origins}, ensure_ascii=False, indent=2), encoding="utf-8")
        self._log("auth", "INFO", f"已导出右侧工作区登录态 Cookie：{len(cookies)} 个，localStorage：{len(local_items)} 项")
        return path

    def _uses_right_workspace_runtime(self) -> bool:
        external_browser = (
            self.current_robot_type == "INTERCEPT"
            and os.getenv("ACS_GUI_EXTERNAL_BROWSER", "0").strip().lower() in {"1", "true", "yes", "on"}
        )
        return not external_browser

    def _run_with_runtime_guard(self, target_args: list[str], title: str, browser_name: str, robot_id: str = "") -> None:
        robot_id = robot_id or self.selected_robot_id
        self._reset_robot_log_buffer(robot_id)
        self._process_runtime_selected_browser[robot_id] = ""
        if self.settings.prepare_runtime_before_start:
            self._process_pending_tasks[robot_id] = (title, target_args, browser_name)
            self._start_process(self._common_args() + ["prepare-runtime", "--browser-name", browser_name], title="检查浏览器运行时", phase="runtime-guard", robot_id=robot_id)
        else:
            self._start_process(target_args, title=title, phase="task", robot_id=robot_id)

    def _start_process(self, cli_args: list[str], title: str, phase: str = "task", robot_id: str = "") -> None:
        robot_id = str(robot_id or self.selected_robot_id or "").strip()
        if not robot_id:
            QMessageBox.warning(self, "提示", "缺少机器人 ID，无法启动任务。")
            return
        if self._is_robot_process_running(robot_id):
            QMessageBox.warning(self, "提示", "当前机器人已经在运行，请先停止或等待完成。")
            return
        program, arguments = build_launch_command(cli_args)
        process = QProcess(self)
        process.setProgram(program)
        process.setArguments(arguments)
        process.setWorkingDirectory(str(self.project_root))
        env = runtime_env_for_child(os.environ.copy())
        env.pop("PW_BROWSER_CHANNEL", None)
        env["ACS_GUI_MODE"] = "1"
        env["ACS_GUI_MULTI_ACCOUNT_ISOLATED"] = "1"
        # 多账号并发时，主动私信仍然使用独立运行时 profile；但登录来源按
        # “平台 + 机器人名称”复用，同名截流/私信机器人共享登录态，不同名机器人隔离。
        # 机器人采集进程固定后台执行，不额外弹出系统浏览器/外部采集窗口。
        env["ACS_DISABLE_EXTERNAL_BROWSER"] = "1"
        env.setdefault("ACS_PM_USE_GUI_WORKSPACE", "0")
        env.setdefault("ACS_PM_PROFILE_MODE", "shared_runtime")
        # 源码运行和正式包都默认只使用项目内置 Playwright Chromium，避免偶发拉起本机 Chrome/Edge。
        env["ACS_ALLOW_SYSTEM_BROWSER_FALLBACK"] = "0"
        env["ACS_SPEECH_HEADLESS"] = "1"
        env["ACS_SPEECH_RETRY_VISIBLE_ON_FAIL"] = "0"
        if is_frozen_app():
            # 正式包必须只使用内置 Playwright 运行时，禁止弹 cmd 下载或回退本机 Chrome/Edge。
            env["ACS_PLAYWRIGHT_AUTO_INSTALL"] = "0"
            env["PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"] = "1"
        else:
            # 源码调试仍允许自动安装/修复 Playwright Chromium，但不允许回退系统浏览器。
            env.setdefault("ACS_PLAYWRIGHT_AUTO_INSTALL", "1")
            env.setdefault("ACS_PLAYWRIGHT_INSTALL_TIMEOUT_SECONDS", "900")
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONUTF8"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        tmp_dir = self.project_root / "state" / "tmp"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        env.setdefault("TMP", str(tmp_dir))
        env.setdefault("TEMP", str(tmp_dir))
        process.setProcessEnvironment(_to_qprocess_env(env))
        process.setProcessChannelMode(QProcess.ProcessChannelMode.MergedChannels)
        process.readyRead.connect(lambda rid=robot_id, proc=process: self._append_process_output(rid, proc))
        process.finished.connect(lambda code, status, rid=robot_id: self._on_process_finished(rid, code, status))
        process.errorOccurred.connect(lambda error, rid=robot_id: self._on_process_error(rid, error))
        process.started.connect(lambda rid=robot_id, proc=process: self._on_process_started(rid, proc))
        self.processes[robot_id] = process
        self._process_robot_types.setdefault(robot_id, self.current_robot_type)
        self.process = process
        self._active_process_robot_id = robot_id
        self._process_phases[robot_id] = phase
        self._process_last_skipped.discard(robot_id)
        self._process_stop_requested.discard(robot_id)
        self.latest_json_path = None
        self.latest_summary_path = None
        self._open_log_file(title)
        self._set_running_state(True, robot_id=robot_id)
        self._log("process", "INFO", f"启动任务：{title}（robotId={robot_id}）", robot_id=robot_id)
        self._log("process", "INFO", f"工作目录：{self.project_root}", robot_id=robot_id)
        self._log("process", "INFO", f"命令：{program} {' '.join(arguments)}", robot_id=robot_id)
        process.start()

    def _on_process_started(self, robot_id: str, process: QProcess) -> None:
        pid = int(process.processId()) if process else 0
        self._log("process", "INFO", f"子进程已启动，robotId={robot_id}，PID={pid}", robot_id=robot_id)

    def _append_process_output(self, robot_id: str, process: QProcess) -> None:
        if not process:
            return
        text = _decode_process_output(bytes(process.readAllStandardOutput()))
        if not text:
            return
        for line in text.splitlines():
            self._append_raw_log(line, robot_id=robot_id)
            if line.startswith(RUNTIME_BROWSER_SELECTED_PREFIX):
                self._handle_runtime_browser_selected(line, robot_id=robot_id)
            if line.startswith(TARGET_EVENT_PREFIX):
                self._handle_target_event(line, robot_id=robot_id)
            if line.startswith("[HEARTBEAT]") and (not robot_id or robot_id == self.selected_robot_id):
                self.top_bar.set_runtime_hint("截流任务仍在运行：已更新恢复检查点")
            if line.startswith(GUI_DOM_REQUEST_PREFIX):
                self._handle_gui_dom_request(line, robot_id=robot_id)
            if line.startswith(GUI_CONTENT_REQUEST_PREFIX):
                self._handle_gui_content_request(line, robot_id=robot_id)
            if line.startswith(GUI_PRIVATE_MESSAGE_REQUEST_PREFIX):
                self._handle_gui_private_message_request(line, robot_id=robot_id)
            if line.startswith("[SKIP]"):
                self._process_last_skipped.add(robot_id)
            m = JSON_PATH_RE.search(line)
            if m:
                value = m.group(1).strip()
                self.latest_json_path = value
                if robot_id:
                    self.latest_json_paths[robot_id] = value
            s = SUMMARY_PATH_RE.search(line)
            if s:
                value = s.group(1).strip()
                self.latest_summary_path = value
                if robot_id:
                    self.latest_summary_paths[robot_id] = value


    def _handle_runtime_browser_selected(self, line: str, robot_id: str = "") -> None:
        raw = line[len(RUNTIME_BROWSER_SELECTED_PREFIX):].strip()
        try:
            payload = json.loads(raw)
        except Exception:
            return
        browser_name = str(payload.get("browserName") or "").strip().lower()
        if browser_name:
            if robot_id:
                self._process_runtime_selected_browser[robot_id] = browser_name
            self._runtime_selected_browser_name = browser_name

    def _replace_browser_arg(self, args: list[str], browser_name: str) -> list[str]:
        browser_name = str(browser_name or "").strip().lower()
        if not browser_name:
            return list(args)
        updated = list(args)
        try:
            index = updated.index("--browser-name")
            if index + 1 < len(updated):
                updated[index + 1] = browser_name
            else:
                updated.append(browser_name)
        except ValueError:
            updated.extend(["--browser-name", browser_name])
        return updated

    def _write_gui_dom_response(self, output_path: str, payload: dict[str, Any]) -> None:
        try:
            path = Path(output_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as exc:
            self._log("browser", "WARN", f"写入右侧工作区 DOM 结果失败：{exc}")

    def _handle_gui_content_request(self, line: str, robot_id: str = "") -> None:
        raw = line[len(GUI_CONTENT_REQUEST_PREFIX):].strip()
        try:
            payload = json.loads(raw)
        except Exception as exc:
            self._log("browser", "WARN", f"Parse GUI content request failed: {exc}")
            return
        if not isinstance(payload, dict):
            return
        url = str(payload.get("url") or "").strip()
        output_path = str(payload.get("output_path") or "").strip()
        request_id = str(payload.get("request_id") or "").strip()
        try:
            max_comments = max(int(payload.get("max_comments") or 50), 0)
        except Exception:
            max_comments = 50
        try:
            scroll_rounds = max(int(payload.get("scroll_rounds") or 5), 1)
        except Exception:
            scroll_rounds = 5
        try:
            pause_ms = max(int(payload.get("pause_ms") or 900), 500)
        except Exception:
            pause_ms = 900
        if not output_path:
            return

        def write_result(data: dict[str, Any]) -> None:
            result = dict(data or {})
            result["request_id"] = request_id
            result["url"] = url
            self._write_gui_dom_response(output_path, result)

        workspace = self._activate_workspace_for_robot(robot_id, create=True, show=(robot_id == self.selected_robot_id)) if robot_id else self._current_workspace()
        page = workspace.page if workspace else self.preview_page
        view = workspace.view if workspace else self.preview_view
        workspace_key = workspace.key if workspace else self.active_preview_workspace_key
        if not page or not view:
            write_result({"ok": False, "reason": "gui_webview_not_available", "comments": []})
            return
        if not url:
            write_result({"ok": False, "reason": "empty_url", "comments": []})
            return

        self._log("browser", "INFO", f"Right workspace content capture: {url}")
        state = {"done": False, "started": False}

        extract_js_template = r'''
(maxComments) => {
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const clean = s => {
    s = norm(s);
    return s && !/^(回复|分享|展开|收起|查看更多回复|\d+)$/.test(s) ? s : '';
  };
  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 2 && rect.height > 2;
  };
  const firstMeta = names => {
    for (const name of names) {
      const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
      const value = norm(el && el.getAttribute('content'));
      if (value) return value;
    }
    return '';
  };
  const title = clean(firstMeta(['og:title', 'twitter:title']) || document.title || '');
  const description = clean(firstMeta(['description', 'og:description', 'twitter:description']));
  const bodyText = norm((document.body && (document.body.innerText || document.body.textContent)) || '');
  const h1 = clean(Array.from(document.querySelectorAll('h1, [data-e2e*="title" i], [class*="title" i]')).map(el => el.innerText || el.textContent || '').find(clean) || '');
  const caption = clean(h1 || title || description);
  const tagText = `${caption} ${description} ${bodyText.slice(0, 3000)}`;
  const tags = Array.from(new Set((tagText.match(/#[^\s#，,。.!！?？;；:：]+/g) || []).map(x => x.slice(0, 60)))).slice(0, 20);
  const video = Array.from(document.querySelectorAll('video')).find(visible) || document.querySelector('video');
  const duration = video && Number.isFinite(Number(video.duration)) ? Number(video.duration) : null;
  const mediaUrl = norm(video && (video.currentSrc || video.src));
  const timeText = (() => {
    const candidates = Array.from(document.querySelectorAll('time, [datetime], [title], span, div')).slice(0, 500);
    for (const el of candidates) {
      const value = norm(el.getAttribute('datetime') || el.getAttribute('title') || el.innerText || el.textContent || '');
      if (/刚刚|昨天|前天|分钟前|小时前|天前|周前|月前|\d{4}[年\-/]\d{1,2}|\d{1,2}[\-/]\d{1,2}/.test(value)) return value;
    }
    return '';
  })();
  const escapeRe = s => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const removeUi = (text, nickname, timeRaw, region) => {
    let t = norm(text);
    if (nickname) t = t.replace(new RegExp('^' + escapeRe(nickname) + '\\s*'), '');
    if (timeRaw) t = t.replace(timeRaw, '');
    if (region) t = t.replace(region, '');
    t = t.replace(/IP属地[:：]?\s*[^\s·•]+/g, '');
    t = t.replace(/\b(回复|分享|展开|收起|查看更多回复|置顶|作者)\b/g, '');
    t = t.replace(/[·•]+/g, ' ').replace(/\s+\d+\s*$/g, '').trim();
    return clean(t);
  };
  const commentNodes = [];
  const selectors = [
    '[data-e2e="comment-item"]',
    '[data-e2e*="comment" i][class*="item" i]',
    'div[class*="comment-item" i]',
    'div[class*="CommentItem" i]',
    'li[class*="comment" i]',
  ];
  for (const selector of selectors) {
    for (const node of Array.from(document.querySelectorAll(selector))) {
      if (visible(node) && !commentNodes.includes(node)) commentNodes.push(node);
      if (commentNodes.length >= Math.max(1, maxComments) * 3) break;
    }
    if (commentNodes.length) break;
  }
  const comments = [];
  const seen = new Set();
  const hash = text => {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
  };
  for (const node of commentNodes) {
    const full = norm(node.innerText || node.textContent || '');
    if (!full) continue;
    const userLink = Array.from(node.querySelectorAll('a[href*="/user/"]')).find(a => clean(a.innerText || a.textContent || ''));
    const nickname = clean(userLink && (userLink.innerText || userLink.textContent || '')) || clean(full.split(/\n+/)[0] || '');
    const userId = userLink ? new URL(userLink.getAttribute('href') || userLink.href || '', location.href).href : '';
    const timeRaw = (full.match(/(刚刚|昨天\s*\d{1,2}:\d{2}|今天\s*\d{1,2}:\d{2}|\d+\s*分钟前|\d+\s*小时前|\d+\s*天前|\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2})/) || [])[1] || '';
    const region = (full.match(/IP属地[:：]?\s*([^\s·•]+)/) || [])[0] || '';
    const textCandidates = Array.from(node.querySelectorAll('p[data-e2e*="comment" i], span[data-e2e*="comment" i], [class*="comment-content" i], p, span'))
      .map(el => removeUi(el.innerText || el.textContent || '', nickname, timeRaw, region))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    const commentText = textCandidates[0] || removeUi(full, nickname, timeRaw, region);
    if (!commentText) continue;
    const key = `${nickname}|${timeRaw}|${commentText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    comments.push({
      comment_id: node.getAttribute('data-id') || node.getAttribute('data-e2e-comment-id') || hash(key),
      parent_comment_id: null,
      user_id: userId,
      nickname,
      comment_text: commentText,
      comment_time_raw: timeRaw,
      comment_time_iso: null,
      visible_region: region,
      comment_type: 'text',
      has_media: false,
      media_urls: [],
      replies: [],
    });
    if (comments.length >= maxComments) break;
  }
  return {
    ok: Boolean(caption || description || comments.length),
    reason: comments.length ? 'ok' : 'no_visible_comments',
    current_url: location.href,
    title,
    caption,
    description,
    tags,
    duration,
    media_url: mediaUrl,
    publish_time_raw: timeText,
    comments,
    debug: {
      ready_state: document.readyState,
      body_text_len: bodyText.length,
      comment_node_count: commentNodes.length,
      video_count: document.querySelectorAll('video').length,
    },
  };
}
'''

        scroll_js = r'''
(() => {
  const used = [];
  const clickText = /评论|展开|查看更多|更多回复|View more|more/i;
  for (const el of Array.from(document.querySelectorAll('button, [role="button"], span, div')).slice(0, 700)) {
    try {
      const text = String(el.innerText || el.textContent || '').trim();
      const rect = el.getBoundingClientRect();
      if (rect.width > 2 && rect.height > 2 && clickText.test(text)) el.click();
    } catch (e) {}
  }
  const push = (el, label) => {
    if (!el) return;
    try {
      const before = el.scrollTop || 0;
      el.scrollTop = before + 1400;
      el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 1400 }));
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
      used.push({ label, before, after: el.scrollTop || 0 });
    } catch (e) {}
  };
  push(document.scrollingElement || document.documentElement || document.body, 'document');
  for (const el of Array.from(document.querySelectorAll('main, [role="main"], [class*="comment" i], div, section')).slice(0, 900)) {
    try {
      const style = getComputedStyle(el);
      const canScroll = (el.scrollHeight || 0) - (el.clientHeight || 0) > 80;
      if (canScroll || /auto|scroll|overlay/i.test(`${style.overflow} ${style.overflowY}`)) push(el, (el.getAttribute('data-e2e') || el.id || el.className || el.tagName || 'node').toString().slice(0, 80));
    } catch (e) {}
    if (used.length >= 12) break;
  }
  return { ok: true, used };
})()
'''

        def finish(data: dict[str, Any]) -> None:
            if state.get("done"):
                return
            state["done"] = True
            write_result(data)
            comments_count = len(data.get("comments") or []) if isinstance(data.get("comments"), list) else 0
            self._log("browser", "INFO", f"Right workspace content capture done: ok={data.get('ok')}, comments={comments_count}, reason={data.get('reason') or '-'}")

        def extract_once(attempt: int = 0) -> None:
            if state.get("done") or not page:
                return

            def after_extract(result: Any) -> None:
                if state.get("done"):
                    return
                if isinstance(result, str):
                    try:
                        parsed = json.loads(result)
                        data = parsed if isinstance(parsed, dict) else {"ok": False, "reason": "extract_result_not_dict", "comments": []}
                    except Exception as exc:
                        data = {"ok": False, "reason": f"extract_json_parse_failed: {exc}", "comments": [], "raw": result[:500]}
                elif isinstance(result, dict):
                    data = result
                else:
                    data = {"ok": False, "reason": "extract_result_not_dict", "comments": []}
                comments = data.get("comments") if isinstance(data, dict) else []
                if isinstance(comments, list) and comments:
                    finish(data)
                    return
                if attempt >= scroll_rounds:
                    finish(data)
                    return
                try:
                    page.runJavaScript(scroll_js, lambda _ignored, a=attempt: QTimer.singleShot(pause_ms, lambda: extract_once(a + 1)))
                except Exception as exc:
                    finish({"ok": False, "reason": f"scroll_js_failed: {exc}", "comments": []})

            try:
                code = f"JSON.stringify(({extract_js_template})({max_comments}))"
                page.runJavaScript(code, after_extract)
            except Exception as exc:
                finish({"ok": False, "reason": f"extract_js_failed: {exc}", "comments": []})

        def start_extract_once() -> None:
            if state.get("done") or state.get("started"):
                return
            state["started"] = True
            QTimer.singleShot(max(pause_ms, 1800), lambda: extract_once(0))

        def on_load_finished(_ok: bool) -> None:
            try:
                page.loadFinished.disconnect(on_load_finished)  # type: ignore[attr-defined]
            except Exception:
                pass
            start_extract_once()

        try:
            page.loadFinished.connect(on_load_finished)  # type: ignore[attr-defined]
        except Exception:
            pass
        try:
            self._load_workspace_url(url, force=True, workspace_key=workspace_key)
            QTimer.singleShot(7000, start_extract_once)
        except Exception as exc:
            try:
                page.loadFinished.disconnect(on_load_finished)  # type: ignore[attr-defined]
            except Exception:
                pass
            finish({"ok": False, "reason": f"load_workspace_failed: {exc}", "comments": []})

    def _handle_gui_private_message_request(self, line: str, robot_id: str = "") -> None:
        raw = line[len(GUI_PRIVATE_MESSAGE_REQUEST_PREFIX):].strip()
        try:
            payload = json.loads(raw)
        except Exception as exc:
            self._log("browser", "WARN", f"解析右侧工作区私信请求失败：{exc}")
            return
        if not isinstance(payload, dict):
            return
        url = str(payload.get("url") or "").strip()
        message = str(payload.get("message") or "")
        output_path = str(payload.get("output_path") or "").strip()
        request_id = str(payload.get("request_id") or "").strip()
        task_no = str(payload.get("taskNo") or payload.get("taskId") or "").strip()
        label = str(payload.get("label") or "").strip()
        if not output_path:
            return

        def write_result(data: dict[str, Any]) -> None:
            result = dict(data or {})
            result["request_id"] = request_id
            result["url"] = url
            result["taskNo"] = task_no
            self._write_gui_dom_response(output_path, result)

        workspace = self._activate_workspace_for_robot(robot_id, create=True, show=(robot_id == self.selected_robot_id)) if robot_id else self._current_workspace()
        page = workspace.page if workspace else self.preview_page
        view = workspace.view if workspace else self.preview_view
        workspace_key = workspace.key if workspace else self.active_preview_workspace_key
        if not page or not view:
            write_result({"ok": False, "reason": "gui_webview_not_available"})
            return
        if not url:
            write_result({"ok": False, "reason": "empty_url"})
            return
        if not message:
            write_result({"ok": False, "reason": "empty_message"})
            return

        self._log("browser", "INFO", f"右侧工作区执行主动私信：{label or task_no or url}")
        state = {"done": False, "started": False}

        def finish(data: dict[str, Any]) -> None:
            if state.get("done"):
                return
            state["done"] = True
            write_result(data)
            self._log("browser", "INFO", f"右侧工作区主动私信完成：ok={data.get('ok')}，原因={data.get('reason') or '-'}")

        click_entry_js = r'''
(() => {
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 2 && rect.height > 2;
  };
  const cssPath = el => {
    try {
      if (!el) return '';
      if (el.id) return '#' + el.id;
      const parts = [];
      let node = el;
      for (let i = 0; node && node.nodeType === 1 && i < 5; i++, node = node.parentElement) {
        let part = node.tagName.toLowerCase();
        const cls = Array.from(node.classList || []).slice(0, 3).join('.');
        if (cls) part += '.' + cls;
        parts.unshift(part);
      }
      return parts.join(' > ');
    } catch (e) { return ''; }
  };
  const dialogVisible = () => !!Array.from(document.querySelectorAll('[data-e2e="im-dialog"], #imSaasContainerId, [class*="componentsEntrywrapper"], [data-e2e="msg-input"], [data-slate-editor="true"][contenteditable="true"], [data-placeholder="发送消息"][contenteditable="true"]')).find(visible);
  if (dialogVisible()) return { ok: true, alreadyOpen: true, currentUrl: location.href, title: document.title };
  const isBadGlobalNav = el => {
    try {
      const rect = el.getBoundingClientRect();
      const parentText = norm((el.closest('nav, aside, [class*="side" i], [class*="menu" i]') || {}).innerText || '');
      if (rect.left < 260 && /精选|推荐|关注|朋友|我的|直播|放映厅|短剧|小游戏|私信/.test(parentText)) return true;
    } catch (e) {}
    return false;
  };
  const clickableAncestor = el => {
    let node = el;
    for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
      if (!visible(node)) continue;
      const tag = (node.tagName || '').toLowerCase();
      const role = String(node.getAttribute && node.getAttribute('role') || '').toLowerCase();
      const disabled = node.disabled || String(node.getAttribute && node.getAttribute('aria-disabled') || '').toLowerCase() === 'true';
      const cursor = getComputedStyle(node).cursor;
      if (!disabled && (tag === 'button' || tag === 'a' || role === 'button' || cursor === 'pointer' || /button|btn/i.test(String(node.className || '')))) return node;
    }
    return el;
  };
  const exactTexts = new Set(['私信', '发私信', '发送消息']);
  const candidates = [];
  const push = (el, priority) => {
    if (!el || !visible(el) || isBadGlobalNav(el)) return;
    const text = norm(el.innerText || el.textContent || el.getAttribute('aria-label') || '');
    if (!exactTexts.has(text)) return;
    const clickable = clickableAncestor(el);
    if (!clickable || !visible(clickable) || isBadGlobalNav(clickable)) return;
    const rect = clickable.getBoundingClientRect();
    candidates.push({ el: clickable, source: el, priority, left: rect.left, top: rect.top, area: rect.width * rect.height });
  };
  ['.csTRSiPn button', '.gNqMqxqn button', 'button', '[role="button"]', 'a', 'span', 'p', 'div'].forEach((sel, idx) => {
    Array.from(document.querySelectorAll(sel)).forEach(el => {
      const text = norm(el.innerText || el.textContent || el.getAttribute('aria-label') || '');
      if (text.length <= 16) push(el, idx * 10);
    });
  });
  candidates.sort((a, b) => a.priority - b.priority || b.left - a.left || a.top - b.top || a.area - b.area);
  const chosen = candidates[0];
  if (!chosen) {
    return {
      ok: false,
      reason: 'private_entry_not_found',
      currentUrl: location.href,
      title: document.title,
      hasPrivateText: norm(document.body && document.body.innerText || '').includes('私信'),
      bodyTextSample: norm(document.body && document.body.innerText || '').slice(0, 500),
    };
  }
  const el = chosen.el;
  try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
  const rect = el.getBoundingClientRect();
  const x = rect.left + Math.max(2, Math.min(rect.width - 2, rect.width / 2));
  const y = rect.top + Math.max(2, Math.min(rect.height - 2, rect.height / 2));
  try {
    ['mouseover', 'mouseenter', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach(type => {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }));
    });
  } catch (e) {}
  try { el.click && el.click(); } catch (e) {}
  return { ok: true, clicked: true, text: norm(chosen.source.innerText || chosen.source.textContent || ''), path: cssPath(el), currentUrl: location.href, title: document.title };
})()
'''


        locate_private_entry_js = r'''
(() => {
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 8 && rect.height > 8;
  };
  const cssPath = el => {
    try {
      if (!el) return '';
      if (el.id) return '#' + el.id;
      const parts = [];
      let node = el;
      for (let i = 0; node && node.nodeType === 1 && i < 6; i++, node = node.parentElement) {
        let part = node.tagName.toLowerCase();
        const data = node.getAttribute && (node.getAttribute('data-e2e') || node.getAttribute('aria-label'));
        if (data) part += `[${data}]`;
        const cls = Array.from(node.classList || []).slice(0, 2).join('.');
        if (cls) part += '.' + cls;
        parts.unshift(part);
      }
      return parts.join(' > ');
    } catch (e) { return ''; }
  };
  const dialogVisible = () => !!Array.from(document.querySelectorAll('[data-e2e="im-dialog"], #imSaasContainerId, [data-slate-editor="true"][contenteditable="true"], [data-placeholder="发送消息"][contenteditable="true"], [data-e2e="msg-input"]')).find(visible);
  if (dialogVisible()) return { ok: true, alreadyOpen: true, currentUrl: location.href, title: document.title };
  const isBadGlobalNav = el => {
    try {
      const rect = el.getBoundingClientRect();
      const parent = el.closest('nav, aside, [class*="side" i], [class*="menu" i]');
      const parentText = norm(parent && parent.innerText || '');
      if (rect.left < 280 && /精选|推荐|搜索|关注|朋友|我的|直播|放映厅|短剧|小游戏|私信/.test(parentText)) return true;
      if (rect.left < 180 && rect.top > 40) return true;
    } catch (e) {}
    return false;
  };
  const clickableAncestor = el => {
    let node = el;
    for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
      if (!visible(node)) continue;
      const tag = (node.tagName || '').toLowerCase();
      const role = String(node.getAttribute && node.getAttribute('role') || '').toLowerCase();
      const e2e = String(node.getAttribute && node.getAttribute('data-e2e') || '').toLowerCase();
      const disabled = node.disabled || String(node.getAttribute && node.getAttribute('aria-disabled') || '').toLowerCase() === 'true';
      const cursor = getComputedStyle(node).cursor;
      if (!disabled && (tag === 'button' || tag === 'a' || role === 'button' || e2e.includes('im-entry') || e2e.includes('button') || cursor === 'pointer' || /button|btn/i.test(String(node.className || '')))) return node;
    }
    return el;
  };
  const candidates = [];
  const addCandidate = (el, priority, reason) => {
    if (!el || !visible(el) || isBadGlobalNav(el)) return;
    const clickable = clickableAncestor(el);
    if (!clickable || !visible(clickable) || isBadGlobalNav(clickable)) return;
    const rect = clickable.getBoundingClientRect();
    const text = norm(clickable.innerText || clickable.textContent || el.innerText || el.textContent || el.getAttribute('aria-label') || '');
    if (rect.left < 280) return;
    candidates.push({ el: clickable, priority, reason, text, left: rect.left, top: rect.top, area: rect.width * rect.height, width: rect.width, height: rect.height });
  };
  // 真实用户主页里“私信”入口是 data-e2e="im-entry"，内部还有 data-e2e="something-button"，不是 button 标签。
  Array.from(document.querySelectorAll('[data-e2e="im-entry"] [data-e2e="something-button"], [data-e2e="im-entry"]')).forEach(el => addCandidate(el, 1, 'data-e2e-im-entry'));
  Array.from(document.querySelectorAll('[data-e2e="something-button"]')).forEach(el => {
    const text = norm(el.innerText || el.textContent || '');
    if (/^私信$|^发私信$|^发送消息$/.test(text)) addCandidate(el, 5, 'data-e2e-something-button');
  });
  Array.from(document.querySelectorAll('button, [role="button"], a, div, span, p')).forEach(el => {
    const text = norm(el.innerText || el.textContent || el.getAttribute('aria-label') || '');
    if (/^私信$|^发私信$|^发送消息$/.test(text) && text.length <= 16) addCandidate(el, 20, 'text-button');
  });
  candidates.sort((a, b) => a.priority - b.priority || b.left - a.left || a.top - b.top || a.area - b.area);
  const chosen = candidates[0];
  if (!chosen) {
    return {
      ok: false,
      reason: 'private_entry_not_found',
      currentUrl: location.href,
      title: document.title,
      hasPrivateText: norm(document.body && document.body.innerText || '').includes('私信'),
      bodyTextSample: norm(document.body && document.body.innerText || '').slice(0, 700),
    };
  }
  const el = chosen.el;
  try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
  const rect = el.getBoundingClientRect();
  const x = Math.round(rect.left + Math.max(4, Math.min(rect.width - 4, rect.width / 2)));
  const y = Math.round(rect.top + Math.max(4, Math.min(rect.height - 4, rect.height / 2)));
  try { window.__INTERCEPTION_PM_LAST_ENTRY__ = { x, y, path: cssPath(el), reason: chosen.reason, text: chosen.text, at: Date.now() }; } catch (e) {}
  return { ok: true, x, y, path: cssPath(el), reason: chosen.reason, text: chosen.text, currentUrl: location.href, title: document.title, candidates: candidates.slice(0, 5).map(c => ({ reason: c.reason, text: c.text, left: c.left, top: c.top, width: c.width, height: c.height })) };
})()
'''

        dialog_check_js = r'''
(() => {
  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 2 && rect.height > 2;
  };
  const node = Array.from(document.querySelectorAll('[data-e2e="im-dialog"], #imSaasContainerId, [class*="componentsEntrywrapper"], [data-e2e="msg-input"], [data-slate-editor="true"][contenteditable="true"], [data-placeholder="发送消息"][contenteditable="true"]')).find(visible);
  return { ok: !!node, currentUrl: location.href, title: document.title, selector: node ? (node.id ? '#' + node.id : node.tagName) : '' };
})()
'''

        fill_js_template = r'''
(message) => {
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 4 && rect.height > 4;
  };
  const selectors = [
    '[data-slate-editor="true"][contenteditable="true"]',
    '[data-placeholder="发送消息"][contenteditable="true"]',
    '.messageEditorinputArea[contenteditable="true"]',
    '[contenteditable="true"][role="textbox"]',
    'div[role="textbox"]',
    '[contenteditable="true"]',
    'textarea'
  ];
  let input = null;
  let selector = '';
  for (const sel of selectors) {
    const nodes = Array.from(document.querySelectorAll(sel)).filter(visible);
    if (nodes.length) { input = nodes[0]; selector = sel; break; }
  }
  if (!input) return { ok: false, reason: 'message_input_not_found', bodyTextSample: norm(document.body && document.body.innerText || '').slice(0, 500) };
  try { input.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
  try { input.focus(); } catch (e) {}
  const tag = (input.tagName || '').toLowerCase();
  if (tag === 'textarea' || tag === 'input') {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = String(message || '');
    try { input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(message || '') })); } catch (e) { input.dispatchEvent(new Event('input', { bubbles: true })); }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, selector, mode: 'value', len: String(message || '').length };
  }
  try {
    const range = document.createRange();
    range.selectNodeContents(input);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('delete', false, null);
  } catch (e) {
    try { input.innerHTML = ''; } catch (_) {}
  }
  let inserted = false;
  try { inserted = document.execCommand('insertText', false, String(message || '')); } catch (e) { inserted = false; }
  if (!inserted) {
    try { input.textContent = String(message || ''); } catch (e) {}
  }
  try { input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(message || '') })); } catch (e) { input.dispatchEvent(new Event('input', { bubbles: true })); }
  try { input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Process' })); } catch (e) {}
  return { ok: true, selector, mode: inserted ? 'execCommand' : 'textContent', len: norm(input.innerText || input.textContent || input.value || '').length };
}
'''

        send_click_js = r'''
(() => {
  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 2 && rect.height > 2;
  };
  const cssPath = el => {
    try {
      if (el.id) return '#' + el.id;
      const parts = [];
      let node = el;
      for (let i = 0; node && node.nodeType === 1 && i < 5; i++, node = node.parentElement) {
        let part = node.tagName.toLowerCase();
        const cls = Array.from(node.classList || []).slice(0, 3).join('.');
        if (cls) part += '.' + cls;
        parts.unshift(part);
      }
      return parts.join(' > ');
    } catch (e) { return ''; }
  };
  const clickableAncestor = el => {
    let node = el;
    for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
      if (!visible(node)) continue;
      const tag = (node.tagName || '').toLowerCase();
      const role = String(node.getAttribute && node.getAttribute('role') || '').toLowerCase();
      const disabled = node.disabled || String(node.getAttribute && node.getAttribute('aria-disabled') || '').toLowerCase() === 'true';
      const cursor = getComputedStyle(node).cursor;
      if (!disabled && (tag === 'button' || role === 'button' || cursor === 'pointer' || /publishBtn|send|button|btn/i.test(String(node.className || '')))) return node;
    }
    return el;
  };
  const selectors = [
    '.messageMsgInputinputAction .e2e-send-msg-btn',
    '[class*="messageMsgInputinputAction"] [class*="messageMsgInputpublishBtn"]',
    '[class*="messageMsgInputpublishBtn"]',
    '.e2e-send-msg-btn',
    'svg.e2e-send-msg-btn',
    'button[aria-label*="发送"]',
    'button'
  ];
  const candidates = [];
  for (const sel of selectors) {
    Array.from(document.querySelectorAll(sel)).forEach(el => {
      const text = String(el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim();
      const className = String(el.className || '');
      if (sel === 'button' && !/发送|send|publish/i.test(text + ' ' + className)) return;
      const clickable = clickableAncestor(el);
      if (!visible(clickable)) return;
      const rect = clickable.getBoundingClientRect();
      candidates.push({ el: clickable, selector: sel, area: rect.width * rect.height, right: rect.right, bottom: rect.bottom });
    });
    if (candidates.length) break;
  }
  candidates.sort((a, b) => b.right - a.right || b.bottom - a.bottom || a.area - b.area);
  const chosen = candidates[0];
  if (!chosen) return { ok: false, reason: 'send_button_not_found' };
  const el = chosen.el;
  try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
  const rect = el.getBoundingClientRect();
  const x = rect.left + Math.max(2, Math.min(rect.width - 2, rect.width / 2));
  const y = rect.top + Math.max(2, Math.min(rect.height - 2, rect.height / 2));
  try {
    ['mouseover', 'mouseenter', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach(type => {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }));
    });
  } catch (e) {}
  try { el.click && el.click(); } catch (e) {}
  return { ok: true, selector: chosen.selector, tag: el.tagName, path: cssPath(el), x, y };
})()
'''

        def normalize_js_result(result: Any, fallback_reason: str) -> dict[str, Any]:
            if isinstance(result, dict):
                return result
            if isinstance(result, str):
                raw = result.strip()
                if raw:
                    try:
                        parsed = json.loads(raw)
                        if isinstance(parsed, dict):
                            return parsed
                        return {"ok": False, "reason": fallback_reason, "rawType": type(parsed).__name__, "raw": parsed}
                    except Exception:
                        return {"ok": False, "reason": fallback_reason, "rawType": "str", "raw": raw[:800]}
                return {"ok": False, "reason": fallback_reason, "rawType": "empty_str"}
            if isinstance(result, bool):
                return {"ok": bool(result), "reason": "" if result else fallback_reason, "rawType": "bool"}
            if result is None:
                return {"ok": False, "reason": fallback_reason, "rawType": "None"}
            return {"ok": False, "reason": fallback_reason, "rawType": type(result).__name__, "raw": str(result)[:800]}

        def run_js(code: str, callback) -> None:
            if state.get("done") or not page:
                return
            # QWebEngine 在部分 Windows/PySide6 版本里不能稳定把 JS Object 转成 Python dict，
            # 会导致明明 JS 已经找到并点击了按钮，回调却收到 None/非 dict，进而误报 click_result_not_dict。
            # 这里统一把 JS 结果 JSON.stringify 成字符串，再由 Python 解析。
            wrapped_code = f"""
(() => {{
  try {{
    const __value = ({code});
    return JSON.stringify(__value === undefined ? {{ ok: false, reason: 'js_return_undefined' }} : __value);
  }} catch (e) {{
    return JSON.stringify({{ ok: false, reason: 'js_exception', message: String(e && e.message || e), stack: String(e && e.stack || '') }});
  }}
}})()
"""
            try:
                page.runJavaScript(wrapped_code, callback)
            except Exception as exc:
                finish({"ok": False, "reason": f"run_javascript_failed: {exc}"})

        def after_send(result: Any) -> None:
            if state.get("done"):
                return
            data = normalize_js_result(result, "send_result_not_dict")
            if data.get("ok"):
                finish({"ok": True, "mode": "gui_workspace", "send": data})
            else:
                finish({"ok": False, "mode": "gui_workspace", "reason": data.get("reason") or "send_button_not_found", "send": data})

        def send_message() -> None:
            QTimer.singleShot(800, lambda: run_js(send_click_js, after_send))

        def after_fill(result: Any) -> None:
            if state.get("done"):
                return
            data = normalize_js_result(result, "fill_result_not_dict")
            if not data.get("ok"):
                finish({"ok": False, "mode": "gui_workspace", "reason": data.get("reason") or "message_input_not_found", "fill": data})
                return
            send_message()

        def fill_message() -> None:
            code = f"({fill_js_template})({json.dumps(message, ensure_ascii=False)})"
            run_js(code, after_fill)

        def wait_dialog(attempt: int = 0, entry_data: dict[str, Any] | None = None) -> None:
            if state.get("done"):
                return
            def after_check(result: Any) -> None:
                data = normalize_js_result(result, "dialog_check_result_not_dict")
                if data.get("ok"):
                    QTimer.singleShot(800, fill_message)
                    return
                if attempt >= 35:
                    finish({"ok": False, "mode": "gui_workspace", "reason": "message_dialog_not_found_after_click", "dialog": data, "entry": entry_data or {}})
                    return
                QTimer.singleShot(700, lambda: wait_dialog(attempt + 1, entry_data))
            run_js(dialog_check_js, after_check)

        def native_click_at(x: int, y: int) -> bool:
            if not view or QTest is None:
                return False
            try:
                point = QPoint(max(1, int(x)), max(1, int(y)))
                view.setFocus(Qt.FocusReason.MouseFocusReason)
                QTest.mouseMove(view, point)
                QTest.mouseClick(view, Qt.MouseButton.LeftButton, Qt.KeyboardModifier.NoModifier, point, 80)
                return True
            except Exception as exc:
                self._log("browser", "WARN", f"右侧工作区原生点击失败：{exc}")
                return False

        def click_entry(attempt: int = 0) -> None:
            if state.get("done"):
                return
            def after_locate(result: Any) -> None:
                data = normalize_js_result(result, "locate_private_entry_result_not_dict")
                if not data.get("ok"):
                    # 抖音用户主页头部按钮经常在主 DOM 后几秒才挂载；不要一次没找到就直接失败。
                    if attempt < 35:
                        QTimer.singleShot(700, lambda: click_entry(attempt + 1))
                        return
                    finish({"ok": False, "mode": "gui_workspace", "reason": data.get("reason") or "private_entry_not_found", "entry": data})
                    return
                if data.get("alreadyOpen"):
                    QTimer.singleShot(700, lambda: wait_dialog(0, data))
                    return
                x = int(float(data.get("x") or 0))
                y = int(float(data.get("y") or 0))
                clicked_native = native_click_at(x, y)
                # QWebEngineView 里用真实鼠标点击优先；同时保留 JS 兜底，避免某些系统坐标缩放造成点击偏移。
                if clicked_native:
                    self._log("browser", "INFO", f"右侧工作区已原生点击私信入口：x={x}, y={y}, reason={data.get('reason') or '-'}")
                    QTimer.singleShot(1200, lambda: wait_dialog(0, {**data, "nativeClick": True}))
                    return
                def after_fallback_click(fallback_result: Any) -> None:
                    fallback_data = normalize_js_result(fallback_result, "click_result_not_dict")
                    merged = {**data, "nativeClick": False, "fallbackClick": fallback_data}
                    if not fallback_data.get("ok"):
                        finish({"ok": False, "mode": "gui_workspace", "reason": fallback_data.get("reason") or "private_entry_click_failed", "entry": merged})
                        return
                    QTimer.singleShot(1200, lambda: wait_dialog(0, merged))
                run_js(click_entry_js, after_fallback_click)
            run_js(locate_private_entry_js, after_locate)

        def start_action_once() -> None:
            if state.get("done") or state.get("started"):
                return
            state["started"] = True
            QTimer.singleShot(3000, click_entry)

        def on_load_finished(_ok: bool) -> None:
            try:
                page.loadFinished.disconnect(on_load_finished)  # type: ignore[attr-defined]
            except Exception:
                pass
            start_action_once()

        try:
            page.loadFinished.connect(on_load_finished)  # type: ignore[attr-defined]
        except Exception:
            pass
        try:
            self._load_workspace_url(url, force=True, workspace_key=workspace_key)
            QTimer.singleShot(10000, start_action_once)
        except Exception as exc:
            try:
                page.loadFinished.disconnect(on_load_finished)  # type: ignore[attr-defined]
            except Exception:
                pass
            finish({"ok": False, "reason": f"load_workspace_failed: {exc}"})

    def _handle_gui_dom_request(self, line: str, robot_id: str = "") -> None:
        raw = line[len(GUI_DOM_REQUEST_PREFIX):].strip()
        try:
            payload = json.loads(raw)
        except Exception as exc:
            self._log("browser", "WARN", f"解析右侧工作区 DOM 请求失败：{exc}")
            return
        if not isinstance(payload, dict):
            return
        url = str(payload.get("url") or "").strip()
        output_path = str(payload.get("output_path") or "").strip()
        request_id = str(payload.get("request_id") or "").strip()
        try:
            scroll_rounds = max(int(payload.get("scroll_rounds") or 4), 1)
        except Exception:
            scroll_rounds = 4
        try:
            pause_ms = max(int(payload.get("pause_ms") or 900), 500)
        except Exception:
            pause_ms = 900
        if not output_path:
            return
        workspace = self._activate_workspace_for_robot(robot_id, create=True, show=(robot_id == self.selected_robot_id)) if robot_id else self._current_workspace()
        page = workspace.page if workspace else self.preview_page
        view = workspace.view if workspace else self.preview_view
        workspace_key = workspace.key if workspace else self.active_preview_workspace_key
        if not page or not view:
            self._write_gui_dom_response(output_path, {
                "ok": False,
                "reason": "gui_webview_not_available",
                "request_id": request_id,
                "items": [],
            })
            return
        if not url:
            self._write_gui_dom_response(output_path, {
                "ok": False,
                "reason": "empty_url",
                "request_id": request_id,
                "items": [],
            })
            return

        self._log("browser", "INFO", f"右侧工作区执行主页 DOM 采集：{url}")
        state = {"done": False, "started": False}

        def finish(result: Any, reason: str | None = None) -> None:
            if state.get("done"):
                return
            state["done"] = True
            if isinstance(result, dict):
                data = dict(result)
            else:
                data = {"ok": False, "reason": reason or "non_dict_extract_result", "items": []}
            if reason and not data.get("ok"):
                data["reason"] = reason
            data["request_id"] = request_id
            data["url"] = url
            self._write_gui_dom_response(output_path, data)
            count = len(data.get("items") or []) if isinstance(data.get("items"), list) else 0
            self._log("browser", "INFO", f"右侧工作区 DOM 采集完成：作品数={count}，原因={data.get('reason')}")

        def extract_once(attempt: int = 0) -> None:
            if state.get("done") or not page:
                return
            def after_extract(result: Any) -> None:
                if state.get("done"):
                    return
                if isinstance(result, str):
                    try:
                        parsed = json.loads(result)
                        if isinstance(parsed, dict):
                            result = parsed
                    except Exception as exc:
                        result = {"ok": False, "reason": f"extract_json_parse_failed: {exc}", "items": [], "raw": result[:500]}
                if isinstance(result, dict) and result.get("ok") and isinstance(result.get("items"), list) and result.get("items"):
                    finish(result)
                    return
                if attempt >= scroll_rounds:
                    finish(result if isinstance(result, dict) else {"ok": False, "reason": "extract_failed", "items": []})
                    return
                try:
                    page.runJavaScript(GUI_DOM_SCROLL_JS, lambda _ignored, a=attempt: QTimer.singleShot(pause_ms, lambda: extract_once(a + 1)))
                except Exception as exc:
                    finish({"ok": False, "reason": f"scroll_js_failed: {exc}", "items": []})
            try:
                extract_js = f"JSON.stringify(({GUI_DOM_EXTRACT_JS}))"
                page.runJavaScript(extract_js, after_extract)
            except Exception as exc:
                finish({"ok": False, "reason": f"extract_js_failed: {exc}", "items": []})

        def start_extract_once() -> None:
            if state.get("done") or state.get("started"):
                return
            state["started"] = True
            QTimer.singleShot(max(pause_ms, 1200), lambda: extract_once(0))

        def on_load_finished(_ok: bool) -> None:
            try:
                page.loadFinished.disconnect(on_load_finished)  # type: ignore[attr-defined]
            except Exception:
                pass
            start_extract_once()

        try:
            page.loadFinished.connect(on_load_finished)  # type: ignore[attr-defined]
        except Exception:
            pass
        try:
            self._load_workspace_url(url, force=True, workspace_key=workspace_key)
            # Fallback in case Qt does not emit loadFinished for same-document reloads.
            QTimer.singleShot(6500, start_extract_once)
        except Exception as exc:
            try:
                page.loadFinished.disconnect(on_load_finished)  # type: ignore[attr-defined]
            except Exception:
                pass
            finish({"ok": False, "reason": f"load_workspace_failed: {exc}", "items": []})

    def _should_load_target_in_visible_workspace(self, target_type: str, url: str) -> bool:
        """Decide whether the right-side Qt workspace should navigate to a target URL.

        The real collection and speech/comment work is done by each robot's
        isolated background Playwright process.  The visible workspace is only a
        status/login mirror.  Loading every work/video URL here causes autoplay,
        black video panels and unnecessary resource use, especially with several
        robots running at the same time.  Therefore homepage/profile/private-message
        targets may update the visible page, while work/content video URLs only
        update the status/log.
        """
        target_type = str(target_type or "").strip().lower()
        url_text = str(url or "").strip().lower()
        if not url_text:
            return False
        if target_type in {"homepage", "profile", "account", "user", "private_message"}:
            return True
        if target_type in {"content", "work", "video", "speech"}:
            return False
        if re.search(r"/(?:video|note)/|[?&](?:modal_id|aweme_id|item_id|video_id|vid)=", url_text):
            return False
        return True

    def _handle_target_event(self, line: str, robot_id: str = "") -> None:
        raw = line[len(TARGET_EVENT_PREFIX):].strip()
        try:
            payload = json.loads(raw)
        except Exception:
            return
        if not isinstance(payload, dict):
            return
        event = str(payload.get("event") or "").lower()
        url = str(payload.get("url") or "").strip()
        label = str(payload.get("label") or payload.get("accountName") or "").strip()
        index = payload.get("index")
        total = payload.get("total")
        target_type = str(payload.get("type") or "")
        if target_type == "homepage":
            kind = "主页"
        elif target_type == "private_message":
            kind = "私信目标"
        else:
            kind = "作品"
        if event == "start":
            if url and self._should_load_target_in_visible_workspace(target_type, url):
                if robot_id:
                    self._load_workspace_url_for_robot(robot_id, url, show_if_selected=True)
                elif robot_id == self.selected_robot_id or not robot_id:
                    self._load_workspace_url(url)
            elif url and target_type not in {"homepage", "profile", "account", "user", "private_message"}:
                # Do not mirror work/video playback pages in the visible Qt workspace.
                # Background Playwright handles actual speech/comment operations.
                self._schedule_webview_media_guard(self._workspace_key_for_robot(robot_id, self.robot_map.get(robot_id, {})) if robot_id else "")
            suffix = f"{index}/{total}" if index and total else ""
            if not robot_id or robot_id == self.selected_robot_id:
                self.top_bar.set_runtime_hint(f"正在处理{kind}{suffix}：{label or url}")
        elif event == "done":
            suffix = f"{index}/{total}" if index and total else ""
            if not robot_id or robot_id == self.selected_robot_id:
                self.top_bar.set_runtime_hint(f"{kind}{suffix}处理完成：{label or url}")
        elif event == "error":
            suffix = f"{index}/{total}" if index and total else ""
            if not robot_id or robot_id == self.selected_robot_id:
                self.top_bar.set_runtime_hint(f"{kind}{suffix}处理异常：{label or url}")

    def _on_process_finished(self, robot_id: str, code: int, status) -> None:
        phase = self._process_phases.pop(robot_id, "task")
        process = self.processes.pop(robot_id, None)
        if self.process is process:
            self.process = next((p for p in self.processes.values() if p.state() != QProcess.ProcessState.NotRunning), None)
        self._close_log_file()
        if phase == "runtime-guard" and robot_id in self._process_pending_tasks:
            title, args, requested_browser = self._process_pending_tasks.pop(robot_id)
            if code == 0:
                selected_browser = self._process_runtime_selected_browser.pop(robot_id, "") or requested_browser
                if selected_browser and selected_browser != requested_browser:
                    args = self._replace_browser_arg(args, selected_browser)
                    self._log("process", "WARN", f"运行时已回退为 {selected_browser}，本次任务按该浏览器继续执行。", robot_id=robot_id)
                self._log("process", "INFO", f"运行时检查完成，继续执行：{title}", robot_id=robot_id)
                self._start_process(args, title=title, phase="task", robot_id=robot_id)
                return
            self._log("process", "WARN", f"运行时检查失败，robotId={robot_id}，退出码：{code}", robot_id=robot_id)
            self._set_running_state(False, robot_id=robot_id)
            return
        self._process_pending_tasks.pop(robot_id, None)
        self._process_runtime_selected_browser.pop(robot_id, None)
        self._process_robot_types.pop(robot_id, None)
        stop_requested = robot_id in self._process_stop_requested
        last_skipped = robot_id in self._process_last_skipped
        if stop_requested:
            self._log("process", "INFO", f"任务已停止：robotId={robot_id}", robot_id=robot_id)
        elif code == 0 and last_skipped:
            self._log("process", "INFO", f"任务已跳过：robotId={robot_id}，当前未到配置的运行周期或运行时间段。", robot_id=robot_id)
        else:
            self._log("process", "INFO", f"任务完成：robotId={robot_id}" if code == 0 else f"任务异常结束：robotId={robot_id}，退出码：{code}", robot_id=robot_id)
        self._process_stop_requested.discard(robot_id)
        self._process_last_skipped.discard(robot_id)
        self._set_running_state(False, robot_id=robot_id)
        self._load_robots()

    def _on_process_error(self, robot_id: str, error) -> None:
        if robot_id in self._process_stop_requested:
            self._log("process", "INFO", f"子进程已收到停止信号：robotId={robot_id}，error={error}", robot_id=robot_id)
        else:
            self._log("process", "ERROR", f"子进程错误：robotId={robot_id}，error={error}", robot_id=robot_id)
            self._set_running_state(False, robot_id=robot_id)

    def _stop_process(self, source: str = "用户点击停止按钮", robot_id: str = "") -> None:
        target_robot_id = str(robot_id or self.selected_robot_id or "").strip()
        if self._pending_platform_login_robot_id and (not target_robot_id or target_robot_id == self._pending_platform_login_robot_id) and not self._is_robot_process_running(self._pending_platform_login_robot_id):
            pending_id = self._pending_platform_login_robot_id
            self._log("process", "INFO", f"{source}，已取消等待平台扫码/登录。", robot_id=pending_id)
            self._pending_platform_login_robot_id = ""
            self._pending_platform_login_args = None
            self._pending_platform_login_title = ""
            self._platform_login_autostart_queued = False
            self._platform_login_probe_attempts = 0
            self._platform_login_prompt_logged = False
            self._platform_login_soft_auth_detected = False
            self._platform_login_profile_auth_detected = False
            self._platform_login_profile_auth_path = ""
            try:
                if self._platform_login_probe_timer.isActive():
                    self._platform_login_probe_timer.stop()
            except Exception:
                pass
            self._set_running_state(False, robot_id=pending_id)
            return
        if not target_robot_id:
            QMessageBox.information(self, "提示", "请先选择要停止的机器人。")
            return
        process = self.processes.get(target_robot_id)
        if process and process.state() != QProcess.ProcessState.NotRunning:
            self._process_stop_requested.add(target_robot_id)
            robot_type = self._process_robot_types.get(target_robot_id) or self.current_robot_type
            phase = self._process_phases.get(target_robot_id, "task")
            if robot_type == "INTERCEPT" and phase == "task":
                try:
                    stop_path = request_intercept_stop(self.project_root, target_robot_id, reason=source)
                    self._log("process", "INFO", f"{source}，已请求截流安全停止，等待当前安全节点退出：{stop_path}", robot_id=target_robot_id)
                    self.top_bar.set_runtime_hint("截流任务正在安全停止：会保存当前断点")
                    QTimer.singleShot(70000, lambda rid=target_robot_id: self._force_stop_intercept_if_needed(rid))
                except Exception as exc:
                    self._log("process", "WARN", f"写入截流安全停止请求失败，改为终止进程：{exc}", robot_id=target_robot_id)
                    process.kill()
            else:
                self._log("process", "INFO", f"{source}，正在停止任务，robotId={target_robot_id}...", robot_id=target_robot_id)
                process.kill()
            if self.client:
                try:
                    self.client.update_runtime_status(target_robot_id, "STOPPED", stop_reason="MANUAL")
                except Exception as exc:
                    self._log("robot", "WARN", f"停止状态回写失败：{exc}")
            return
        self._set_running_state(False, robot_id=target_robot_id)

    def _force_stop_intercept_if_needed(self, robot_id: str) -> None:
        process = self.processes.get(robot_id)
        if not process or process.state() == QProcess.ProcessState.NotRunning:
            return
        if robot_id not in self._process_stop_requested:
            return
        if (self._process_robot_types.get(robot_id) or self.current_robot_type) != "INTERCEPT":
            return
        self._log("process", "WARN", "截流安全停止超时，已强制结束子进程；下次可使用“恢复任务”从断点继续。", robot_id=robot_id)
        process.kill()

    def _stop_all_processes(self, source: str = "停止全部任务") -> None:
        for rid in list(self.processes.keys()):
            self._stop_process(source=source, robot_id=rid)

    def _set_running_state(self, running: bool, robot_id: str | None = None) -> None:
        target_robot_id = str(robot_id or self.selected_robot_id or "").strip()
        if target_robot_id:
            if running:
                self.running_robot_ids.add(target_robot_id)
            else:
                self.running_robot_ids.discard(target_robot_id)
            self._sync_legacy_running_id()
            self.robot_panel.update_card_state(target_robot_id, running)
        if target_robot_id and target_robot_id == self.selected_robot_id and target_robot_id in self.robot_map:
            robot = self.robot_map[target_robot_id]
            if running:
                if self._process_phases.get(target_robot_id) == "sync":
                    self.top_bar.set_runtime_hint("正在继续同步本地未完成数据")
                else:
                    self._show_embedded_preview(robot)
            else:
                self._select_robot(target_robot_id)
        if running and self._process_phases.get(target_robot_id) == "sync":
            self.top_bar.set_runtime_hint("正在继续同步本地未完成数据")
        else:
            self.top_bar.set_runtime_hint(self._runtime_hint_text())

    def _export_processed_works(self, robot_id: str | None = None) -> None:
        if robot_id:
            self.selected_robot_id = robot_id
        robot = self.robot_map.get(self.selected_robot_id or "")
        if not robot:
            QMessageBox.warning(self, "导出失败", "请先选择一个截流机器人。")
            return
        try:
            records, source_path = self._load_latest_work_operation_records(robot)
        except Exception as exc:
            QMessageBox.warning(self, "导出失败", f"读取本地作品日志失败：{exc}")
            return
        if not records:
            QMessageBox.information(self, "暂无可导出数据", "还没有找到已处理作品的总日志。请先运行一次截流任务。")
            return

        default_name = f"{_robot_name(robot)}_作品判断表_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        default_name = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", default_name).strip(" ._") or "作品判断表.xlsx"
        default_path = str(self.project_root / default_name)
        path, selected_filter = QFileDialog.getSaveFileName(
            self,
            "导出处理过的作品判断表",
            default_path,
            "Excel 工作簿 (*.xlsx);;CSV 表格 (*.csv);;TXT 文本 (*.txt)",
        )
        if not path:
            return
        out = Path(path)
        if not out.suffix:
            if "CSV" in selected_filter:
                out = out.with_suffix(".csv")
            elif "TXT" in selected_filter:
                out = out.with_suffix(".txt")
            else:
                out = out.with_suffix(".xlsx")
        try:
            out.parent.mkdir(parents=True, exist_ok=True)
            if out.suffix.lower() == ".txt":
                self._write_work_export_txt(out, records)
            elif out.suffix.lower() == ".csv":
                self._write_work_export_csv(out, records)
            else:
                self._write_work_export_xlsx(out, records)
            self._log("export", "INFO", f"作品判断表已导出：{out}")
            QMessageBox.information(
                self,
                "导出完成",
                f"已导出 {len(records)} 条作品记录。\n\n文件位置：{out}\n\n数据来源：{source_path}",
            )
        except Exception as exc:
            QMessageBox.warning(self, "导出失败", f"写入导出文件失败：{exc}")

    def _load_latest_work_operation_records(self, robot: dict[str, Any]) -> tuple[list[dict[str, str]], Path]:
        config = normalize_robot_detail(robot)
        output_root = self.project_root / "output"
        robot_id = _robot_id(robot)
        candidate_paths = self._find_work_operation_log_paths(robot, config)
        unique_paths = sorted(
            {p.resolve() for p in candidate_paths if p and p.exists()},
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if not unique_paths:
            return [], output_root

        target_labels = {str(t.url or ""): str(t.label or "") for t in config.homepage_targets if getattr(t, "url", "")}
        fallback_source = unique_paths[0]
        for log_path in unique_paths:
            rows: list[dict[str, str]] = []
            with log_path.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        raw = json.loads(line)
                    except Exception:
                        continue
                    if not isinstance(raw, dict):
                        continue
                    # New logs carry per-robot metadata.  When present, never mix another
                    # robot's rows even if multiple runs share the same account directory.
                    row_robot_id = str(raw.get("__robot_id") or raw.get("robotId") or raw.get("robot_id") or "").strip()
                    if row_robot_id and robot_id and row_robot_id != robot_id:
                        continue
                    rows.append(self._normalize_work_export_record(raw, target_labels))
            if rows:
                return rows, log_path
        return [], fallback_source

    def _find_work_operation_log_paths(self, robot: dict[str, Any], config: Any) -> list[Path]:
        """Return operation-log candidates that belong to the selected robot only.

        Multi-account concurrent runs can finish in any order.  The previous exporter
        sorted every works_log.jsonl under the platform directory by mtime, so clicking
        any card could export the last finished robot.  This method routes by robotId
        first, then falls back only to the selected robot's own account directory.
        """
        output_root = self.project_root / "output"
        robot_id = _robot_id(robot)
        paths: list[Path] = []
        seen: set[str] = set()

        def add(path: Path | str | None) -> None:
            if not path:
                return
            p = Path(path)
            if not p.is_absolute():
                p = self.project_root / p
            try:
                key = str(p.resolve())
            except Exception:
                key = str(p)
            if key not in seen:
                seen.add(key)
                paths.append(p)

        latest_summary = self.latest_summary_paths.get(robot_id or "")
        for p in self._operation_logs_from_robot_summary(latest_summary, robot_id=robot_id):
            add(p)

        search_roots: list[Path] = []
        account_dir = output_account_dir(output_root, config.platform, config.account_alias)
        platform_dir = output_root / str(config.platform or "")
        if account_dir.exists():
            search_roots.append(account_dir)
        if platform_dir.exists() and platform_dir.resolve() != account_dir.resolve():
            search_roots.append(platform_dir)
        if output_root.exists() and not search_roots:
            search_roots.append(output_root)

        # Prefer authoritative robot_run summaries because they include robot_id/name.
        for root in search_roots:
            for summary_path in root.rglob("robot_run/summary.json"):
                if self._robot_summary_matches(summary_path, robot, config):
                    for p in self._operation_logs_from_robot_summary(summary_path, robot_id=robot_id):
                        add(p)

        # New JSONL files carry __robot_id.  This covers partial runs where summary
        # writing was interrupted but operation rows were already appended.
        for root in search_roots:
            for log_path in root.rglob("operation_log/works_log.jsonl"):
                if self._operation_log_matches_robot(log_path, robot_id):
                    add(log_path)

        # Backward-compatible fallback for old logs that do not yet have metadata.
        # Keep it strictly inside the selected account directory, and only use it if
        # no robot-scoped candidate was found; never fall back to platform-wide latest.
        if not paths and account_dir.exists():
            for log_path in account_dir.glob("*/operation_log/works_log.jsonl"):
                add(log_path)
        return paths

    def _operation_logs_from_robot_summary(self, summary_ref: str | Path | None, robot_id: str = "") -> list[Path]:
        if not summary_ref:
            return []
        summary_path = Path(summary_ref)
        if not summary_path.is_absolute():
            summary_path = self.project_root / summary_path
        if not summary_path.exists():
            return []
        result: list[Path] = []

        def add_from_section(section_summary: Path) -> None:
            try:
                run_dir = section_summary.parent.parent
            except Exception:
                return
            candidate = run_dir / "operation_log" / "works_log.jsonl"
            if candidate.exists():
                result.append(candidate)

        add_from_section(summary_path)
        data = self._read_json_file(summary_path)
        if isinstance(data, dict):
            for item in data.get("targets") or []:
                if not isinstance(item, dict):
                    continue
                target_summary = item.get("summary_path") or item.get("summaryPath")
                if target_summary:
                    add_from_section(Path(str(target_summary)))
        return result

    def _robot_summary_matches(self, summary_path: Path, robot: dict[str, Any], config: Any) -> bool:
        data = self._read_json_file(summary_path)
        if not isinstance(data, dict):
            return False
        expected_id = _robot_id(robot)
        summary_robot_id = str(data.get("robot_id") or data.get("robotId") or "").strip()
        if expected_id and summary_robot_id:
            return summary_robot_id == expected_id
        # Older summaries may not include robot_id.  Match conservatively on platform,
        # account alias and robot name when those fields are available.
        summary_platform = str(data.get("platform") or "").strip().lower()
        if summary_platform and summary_platform != str(config.platform or "").strip().lower():
            return False
        summary_account = str(data.get("account_alias") or data.get("accountAlias") or "").strip()
        if summary_account and summary_account != str(config.account_alias or "").strip():
            return False
        summary_name = str(data.get("name") or data.get("robot_name") or data.get("robotName") or "").strip()
        if summary_name:
            return summary_name == _robot_name(robot)
        return False

    def _operation_log_matches_robot(self, log_path: Path, robot_id: str) -> bool:
        if not robot_id or not log_path.exists():
            return False
        try:
            with log_path.open("r", encoding="utf-8") as f:
                for _, line in zip(range(30), f):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        raw = json.loads(line)
                    except Exception:
                        continue
                    if not isinstance(raw, dict):
                        continue
                    row_robot_id = str(raw.get("__robot_id") or raw.get("robotId") or raw.get("robot_id") or "").strip()
                    if row_robot_id:
                        return row_robot_id == robot_id
        except Exception:
            return False
        return False

    @staticmethod
    def _read_json_file(path: Path) -> Any:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None

    @staticmethod
    def _work_export_fields() -> tuple[str, ...]:
        return (
            "操作的作品的用户主页链接",
            "操作的作品的用户昵称",
            "操作的作品的用户ID",
            "操作的作品链接",
            "操作的作品的标题",
            "操作的作品的描述",
            "操作的作品的标签",
            "操作的作品的口播文案",
            "是否需要继续的判断结果",
            "判断结果的原因",
        )

    def _normalize_work_export_record(self, raw: dict[str, Any], target_labels: dict[str, str]) -> dict[str, str]:
        homepage_url = self._first_text(raw, "操作的作品的用户主页链接", "homepage_url", "source_account_url")
        content_url = self._first_text(raw, "操作的作品链接", "content_url", "source_content_url")
        nickname = self._first_text(raw, "操作的作品的用户昵称", "user_nickname", "homepage_nickname", "author_nickname")
        if not nickname:
            nickname = target_labels.get(homepage_url, "")
        user_id = self._first_text(raw, "操作的作品的用户ID", "user_id", "homepage_user_id", "author_user_id", "platform_content_id")
        if user_id == self._first_text(raw, "platform_content_id"):
            # Legacy logs did not have homepage user id. Do not mislabel the work id as user id.
            user_id = ""
        if not user_id:
            user_id = self._extract_user_id_from_url(homepage_url)
        title_raw = self._first_text(raw, "操作的作品的标题", "content_title", "video_title", "caption")
        desc_raw = self._first_text(raw, "操作的作品的描述", "content_description", "video_description", "description")
        title, tags_from_title = self._split_export_text_and_tags(title_raw)
        desc, tags_from_desc = self._split_export_text_and_tags(desc_raw)
        tags_raw = raw.get("操作的作品的标签") or raw.get("content_tags") or raw.get("video_tags") or raw.get("tags") or ""
        tags = self._normalize_tags_for_export(tags_raw, tags_from_title + tags_from_desc)
        should_raw = raw.get("是否需要继续的判断结果")
        if should_raw in (None, ""):
            should_raw = raw.get("work_decision_should_run") or raw.get("should_run") or raw.get("shouldRun")
        should_text = self._format_should_run_for_export(should_raw)
        return {
            "操作的作品的用户主页链接": homepage_url,
            "操作的作品的用户昵称": nickname,
            "操作的作品的用户ID": user_id,
            "操作的作品链接": content_url,
            "操作的作品的标题": title or title_raw,
            "操作的作品的描述": desc,
            "操作的作品的标签": tags,
            "操作的作品的口播文案": self._first_text(raw, "操作的作品的口播文案", "speech_transcript", "transcript"),
            "是否需要继续的判断结果": should_text,
            "判断结果的原因": self._first_text(raw, "判断结果的原因", "work_decision_reason", "decision_reason", "reason"),
        }

    @staticmethod
    def _first_text(raw: dict[str, Any], *keys: str) -> str:
        for key in keys:
            value = raw.get(key)
            if value is None:
                continue
            if isinstance(value, (list, tuple)):
                text = "、".join(str(x).strip() for x in value if str(x).strip())
            else:
                text = str(value).strip()
            if text:
                return text
        return ""

    @staticmethod
    def _split_export_text_and_tags(value: Any) -> tuple[str, list[str]]:
        text = str(value or "").strip()
        if not text:
            return "", []
        tags = [m.group(1).strip() for m in re.finditer(r"#([^#\s]+)", text) if m.group(1).strip()]
        cleaned = re.sub(r"#([^#\s]+)", " ", text)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" ，,。;；")
        return cleaned, tags

    @staticmethod
    def _normalize_tags_for_export(value: Any, extra: list[str] | None = None) -> str:
        items: list[str] = []
        if isinstance(value, (list, tuple, set)):
            items.extend(str(x or "") for x in value)
        else:
            text = str(value or "")
            if text:
                items.extend(re.split(r"[、,，\s]+", text))
        items.extend(extra or [])
        result: list[str] = []
        seen: set[str] = set()
        for item in items:
            tag = str(item or "").strip().lstrip("#").strip()
            if not tag or tag in seen:
                continue
            seen.add(tag)
            result.append(tag)
        return "、".join(result)

    @staticmethod
    def _format_should_run_for_export(value: Any) -> str:
        if isinstance(value, bool):
            return "是" if value else "否"
        text = str(value if value is not None else "").strip()
        if not text:
            return "未判定"
        lower = text.lower()
        if lower in {"true", "1", "yes", "y", "run", "should_run", "是", "继续", "继续采评论"}:
            return "是"
        if lower in {"false", "0", "no", "n", "skip", "否", "跳过", "跳过评论"}:
            return "否"
        return text

    @staticmethod
    def _extract_user_id_from_url(url: str) -> str:
        text = str(url or "")
        for pattern in (r"[?&](?:sec_uid|sec_user_id|sec_userid)=([^&]+)", r"/user/([^/?#]+)"):
            m = re.search(pattern, text)
            if m:
                return m.group(1).strip()
        return ""

    def _write_work_export_csv(self, path: Path, records: list[dict[str, str]]) -> None:
        fields = list(self._work_export_fields())
        with path.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
            writer.writeheader()
            for row in records:
                writer.writerow({key: row.get(key, "") for key in fields})

    def _write_work_export_txt(self, path: Path, records: list[dict[str, str]]) -> None:
        fields = list(self._work_export_fields())
        parts: list[str] = []
        for idx, row in enumerate(records, start=1):
            parts.append(f"作品 {idx}")
            parts.append("-" * 24)
            for key in fields:
                parts.append(f"{key}：{row.get(key, '')}")
            parts.append("")
        path.write_text("\n".join(parts).strip() + "\n", encoding="utf-8")

    def _write_work_export_xlsx(self, path: Path, records: list[dict[str, str]]) -> None:
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font, PatternFill, Side, Border
        from openpyxl.utils import get_column_letter

        fields = list(self._work_export_fields())
        wb = Workbook()
        ws = wb.active
        ws.title = "作品判断表"
        ws.append(fields)
        for row in records:
            ws.append([row.get(key, "") for key in fields])

        header_fill = PatternFill("solid", fgColor="1F4E78")
        header_font = Font(color="FFFFFF", bold=True)
        thin = Side(style="thin", color="D9E2EC")
        border = Border(left=thin, right=thin, top=thin, bottom=thin)
        widths = [34, 18, 28, 38, 36, 46, 24, 72, 18, 46]
        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = border
        for row in ws.iter_rows(min_row=2):
            for cell in row:
                cell.alignment = Alignment(vertical="top", wrap_text=True)
                cell.border = border
        for idx, width in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(idx)].width = width
        for row_idx in range(2, ws.max_row + 1):
            ws.row_dimensions[row_idx].height = 90
        ws.row_dimensions[1].height = 32
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        wb.save(path)

    def _show_log_dialog(self, robot_id: str | None = None) -> None:
        if robot_id:
            self.selected_robot_id = robot_id
        selected_id = self.selected_robot_id if self.selected_robot_id in self.robot_map else ""
        self.log_dialog_robot_id = selected_id
        title = "日志与接口详情"
        if selected_id:
            title = f"{_robot_name(self.robot_map[selected_id])} · 日志与接口详情"
        self.log_dialog.set_context(title)
        self.log_dialog.set_lines(self._log_lines_for_robot(selected_id))
        self.log_dialog.set_request_entries(list(self.request_buffer))
        self.log_dialog.show()
        self.log_dialog.raise_()
        self.log_dialog.activateWindow()

    def _open_settings(self) -> None:
        dialog = SettingsDialog(self)
        dialog.exec()

    def _common_args(self) -> list[str]:
        return ["--base-dir", str(self.project_root)]

    def _token_cache_path(self) -> Path:
        raw = self.settings.token_cache_path or "config/core_session.json"
        path = Path(raw)
        return path if path.is_absolute() else self.project_root / path

    def _reset_robot_log_buffer(self, robot_id: str) -> None:
        robot_id = str(robot_id or "").strip()
        if not robot_id:
            return
        self.log_buffers[robot_id] = deque(maxlen=800)
        if self.log_dialog.isVisible() and self.log_dialog_robot_id == robot_id:
            self.log_dialog.set_lines([])

    def _log_lines_for_robot(self, robot_id: str) -> list[str]:
        robot_id = str(robot_id or "").strip()
        if robot_id:
            return list(self.log_buffers.get(robot_id, deque(maxlen=800)))
        return list(self.log_buffer)

    def _log(self, scope: str, level: str, message: str, robot_id: str = "") -> None:
        self._append_raw_log(f"[{datetime.now().strftime('%H:%M:%S')}] [{level}] [{scope}] {message}", robot_id=robot_id)

    def _append_raw_log(self, line: str, robot_id: str = "") -> None:
        if not self.settings.gui_log_enabled:
            return
        display_line = _format_log_line_for_operator(line)
        if not display_line:
            return
        robot_id = str(robot_id or "").strip()
        if robot_id:
            display_line = _prepend_robot_log_datetime(display_line)
        self.log_buffer.append(display_line)
        if robot_id:
            buf = self.log_buffers.setdefault(robot_id, deque(maxlen=800))
            buf.append(display_line)
        if self.log_dialog.isVisible():
            active_robot_id = str(getattr(self, "log_dialog_robot_id", "") or "").strip()
            if not active_robot_id or active_robot_id == robot_id:
                self.log_dialog.append_lines([display_line])
        if self._active_log_fp:
            self._active_log_fp.write(display_line + "\n")
            self._active_log_fp.flush()

    def _on_request(self, entry: dict[str, Any]) -> None:
        if not self.settings.interface_trace_enabled:
            return
        self.request_buffer.append(entry)
        if self.log_dialog.isVisible():
            self.log_dialog.append_request_entry(entry)

    def _open_log_file(self, title: str) -> None:
        # GUI logs are kept in memory and shown through the log dialog. Do not
        # persist every run to project_root/runtime/gui_logs, otherwise normal
        # runs create many low-value files on disk.
        self.latest_log_path = None
        self._active_log_fp = None
        return

    def _close_log_file(self) -> None:
        if self._active_log_fp:
            try:
                self._active_log_fp.close()
            except Exception:
                pass
            self._active_log_fp = None

    def closeEvent(self, event) -> None:
        if self._has_running_processes():
            reply = QMessageBox.question(self, "退出确认", "当前还有机器人任务在运行，确认退出并停止全部任务吗？")
            if reply != QMessageBox.StandardButton.Yes:
                event.ignore()
                return
            self._stop_all_processes(source="窗口关闭")
        self._close_log_file()
        event.accept()


def _prepend_robot_log_datetime(line: str) -> str:
    """Prefix a robot task log with one full local date-time marker."""
    raw = str(line or "").strip()
    if not raw:
        return raw
    if re.match(r"^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]\s*", raw):
        return raw
    raw = re.sub(r"^\[\d{2}:\d{2}:\d{2}\]\s*", "", raw)
    return f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {raw}"


def _format_log_line_for_operator(line: str) -> str | None:
    """Return a concise operator-facing log line.

    The child process still prints detailed machine-readable lines for GUI bridges
    and diagnostics, but the normal GUI log should only show step starts, results,
    and failure reasons. Set ACS_GUI_VERBOSE_LOG=1 when the old verbose log is
    needed for development.
    """
    raw = str(line or "").strip()
    if not raw:
        return None
    if _bool_env("ACS_GUI_VERBOSE_LOG", "0"):
        return raw

    # Internal bridge/control lines must remain readable by the GUI process, but
    # they do not need to be displayed to the operator.
    hidden_prefixes = (
        GUI_DOM_REQUEST_PREFIX,
        GUI_CONTENT_REQUEST_PREFIX,
        GUI_PRIVATE_MESSAGE_REQUEST_PREFIX,
        RUNTIME_BROWSER_SELECTED_PREFIX,
    )
    if raw.startswith(hidden_prefixes):
        return None

    if raw.startswith(TARGET_EVENT_PREFIX):
        return _format_target_event_log(raw)

    # Collapse very noisy crawler internals. The README documents the detailed
    # implementation flow; the operator log keeps only business-level results.
    noisy_prefixes = (
        "[POSTS]",
        "[COMMENTS]",
        "[SPEECH] 捕获到候选媒体响应",
        "[SPEECH] 准备处理候选媒体",
        "[SPEECH] 开始下载候选媒体",
        "[SPEECH] 候选媒体下载完成",
        "[SPEECH] 开始用 ffmpeg",
        "[SPEECH] 音频提取完成",
        "[SPEECH] 口播媒体准备完成",
        "[SPEECH] 开始本地语音识别",
        "[SPEECH] 加载 faster-whisper",
        "[SPEECH] 口播媒体捕获策略",
        "[SPEECH] 口播捕获已切换到独立线程执行",
        "[SPEECH] 启动独立 Playwright",
        "[SPEECH] Playwright 已打开作品页",
        "[SPEECH] 独立后台口播捕获失败",
        "[GUI_DOM_REQUEST]",
        "[GUI_CONTENT_REQUEST]",
    )
    if raw.startswith(noisy_prefixes):
        if raw.startswith("[SPEECH] 口播分析失败"):
            return raw
        if raw.startswith("[SPEECH] 语音识别完成"):
            return raw
        return None

    # Filter long samples and file-path dumps while keeping the important count.
    if raw.startswith("[STEP] 主页作品时间判定样例") or raw.startswith("[STEP] 主页作品时长判定样例"):
        return None
    if raw.startswith("[STEP] 主页作品筛选配置"):
        return None
    if raw.startswith("[STEP] 主页作品时间过滤"):
        return _compact_filter_line(raw, "[筛选] 时间过滤")
    if raw.startswith("[STEP] 主页作品时长过滤"):
        return _compact_filter_line(raw, "[筛选] 时长过滤")
    if raw.startswith("[STEP] 主页作品列表采集完成"):
        return _compact_count_line(raw, "[主页] 作品列表采集完成")
    if raw.startswith("[STEP] 主页采集开始"):
        return raw.replace("[STEP]", "[主页]", 1)
    if raw.startswith("[STEP] 主页采集结束"):
        return _compact_homepage_done_line(raw)
    if raw.startswith("[STEP] 主页模式已启用时间过滤"):
        return None
    if raw.startswith("[STEP] 主页作品处理上限") or raw.startswith("[STEP] 主页作品待采集评论数量"):
        return raw
    if raw.startswith("[STEP] 开始采集作品评论"):
        return raw
    if raw.startswith("[STEP] 作品评论采集完成"):
        return _compact_comment_done_line(raw)
    if raw.startswith("[STEP] 作品评论采集未返回记录"):
        return raw.split(" summary=", 1)[0]
    if raw.startswith("[STEP] 作品前置判定为不继续"):
        return raw
    if raw.startswith("[CLEANUP]"):
        return raw.split("，目录=", 1)[0]
    if raw.startswith("[SPEECH_REVIEW] 汇总表"):
        return raw.replace("[SPEECH_REVIEW]", "[总日志]", 1)
    if raw.startswith("[SPEECH_REVIEW] 已输出口播核验数据"):
        return None
    if raw.startswith("[OPERATION_LOG]"):
        return raw.replace("[OPERATION_LOG]", "[总日志]", 1)

    # Hide low-value path dumps and environment details.
    hide_contains = (
        "工作目录：",
        "命令：",
        "子进程已启动",
        "profile:",
        "summary=",
        "debug summary:",
        "已输出后端上传payload",
        "已输出可读评论行JSON",
        "已输出可读评论行CSV",
        "Cookie=",
        "仅检测到：",
    )
    if any(token in raw for token in hide_contains):
        return None

    if raw.startswith("[AUTH] WARN 当前右侧工作区导出的抖音 Cookie"):
        return "[AUTH] 平台登录态较弱：如触发登录弹窗，请在右侧工作区完成登录。"

    if raw.startswith("[SYNC] 待同步评论行数"):
        return _compact_sync_line(raw)

    return raw


def _format_target_event_log(line: str) -> str | None:
    raw = line[len(TARGET_EVENT_PREFIX):].strip()
    try:
        payload = json.loads(raw)
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    event = str(payload.get("event") or "").lower()
    target_type = str(payload.get("type") or "")
    parent_type = str(payload.get("parentType") or "")
    url = str(payload.get("url") or "").strip()
    label = str(payload.get("label") or "").strip()
    index = payload.get("index")
    total = payload.get("total")
    pos = f"{index}/{total}" if index and total else (label or "")

    if target_type == "homepage":
        if event == "start":
            return f"[主页] 开始处理 {pos}：{label or url}"
        if event == "done":
            return f"[主页] 处理完成 {pos}：作品数={payload.get('items', 0)}"
        if event == "error":
            return f"[主页] 处理失败 {pos}：{payload.get('error') or '-'}"
        return None

    if target_type == "content" and parent_type != "homepage":
        if event == "speech_start":
            return f"[口播] 开始分析 {pos}：{url}"
        if event == "speech_done":
            status = str(payload.get("status") or "").upper()
            if status == "SUCCESS":
                return f"[口播] 分析成功 {pos}"
            if status == "DISABLED":
                return f"[口播] 已跳过 {pos}：{payload.get('error') or '-'}"
            return f"[口播] 分析失败 {pos}：{payload.get('error') or '-'}"
        if event == "start":
            return f"[作品] 开始处理 {pos}：{label or url}"
        if event == "done":
            comments = payload.get("comments")
            if comments is not None:
                return f"[作品] 处理完成 {pos}：评论数={comments}"
            return f"[作品] 处理完成 {pos}：作品数={payload.get('items', 0)}"
        if event == "error":
            return f"[作品] 处理失败 {pos}：{payload.get('error') or '-'}"
        return None

    if target_type == "content" and parent_type == "homepage":
        if event == "speech_start":
            return f"[口播] 开始分析 {pos}：{url}"
        if event == "speech_done":
            status = str(payload.get("status") or "").upper()
            if status == "SUCCESS":
                return f"[口播] 分析成功 {pos}"
            return f"[口播] 分析失败 {pos}：{payload.get('error') or '-'}"
        if event == "decision_start":
            return None
        if event == "decision_done":
            should_run = payload.get("shouldRun")
            decision = "继续采评论" if should_run is True else "跳过评论"
            reason = payload.get("reason") or "-"
            return f"[判定] {decision} {pos}：{reason}"
        if event == "start":
            return f"[评论] 开始采集 {pos}：{url}"
        if event == "done":
            if payload.get("skipped"):
                return f"[作品] 完成 {pos}：已跳过评论"
            return f"[作品] 完成 {pos}：评论数={payload.get('comments', 0)}"
        if event == "error":
            return f"[作品] 处理失败 {pos}：{payload.get('error') or '-'}"
        return None

    return None


def _compact_filter_line(line: str, label: str) -> str:
    before = _first_regex_value(line, r"过滤前=(\d+)")
    after = _first_regex_value(line, r"过滤后=(\d+)")
    dropped = _first_regex_value(line, r"过滤(?:过期|超时长)=(\d+)")
    parts = [label]
    if before or after:
        parts.append(f"{before or '?'} -> {after or '?'}")
    if dropped:
        parts.append(f"过滤={dropped}")
    return "，".join(parts)


def _compact_count_line(line: str, label: str) -> str:
    count = _first_regex_value(line, r"作品数=(\d+)")
    return f"{label}：作品数={count or '-'}"


def _compact_comment_done_line(line: str) -> str:
    cleaned = line.split(" summary=", 1)[0]
    return cleaned.replace("[STEP]", "[评论]", 1)


def _compact_homepage_done_line(line: str) -> str:
    count = _first_regex_value(line, r"作品数=(\d+)")
    return f"[主页] 采集结束：作品数={count or '-'}"


def _compact_sync_line(line: str) -> str:
    m = re.search(r"待同步评论行数：([^，]+)", line)
    return f"[SYNC] 待同步评论行数：{m.group(1) if m else '-'}"


def _first_regex_value(text: str, pattern: str) -> str:
    m = re.search(pattern, text)
    return m.group(1) if m else ""

def _extract_robot_items(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("items", "records", "list", "rows", "data"):
        value = data.get(key)
        if isinstance(value, list):
            return [x for x in value if isinstance(x, dict)]
        if isinstance(value, dict):
            nested = _extract_robot_items(value)
            if nested:
                return nested
    return []


def _robot_id(robot: Dict[str, Any]) -> str:
    return str(robot.get("id") or robot.get("robotId") or robot.get("robot_id") or "")


def _robot_name(robot: Dict[str, Any]) -> str:
    return str(robot.get("name") or robot.get("robotName") or "未命名机器人")


def _robot_status(robot: Dict[str, Any]) -> str:
    return str(robot.get("status") or robot.get("runtimeStatus") or "DRAFT").upper()


def _status_label(robot: Dict[str, Any]) -> str:
    status = _robot_status(robot)
    return STATUS_LABEL.get(status, status or "未知")


def _auth_summary(robot: Dict[str, Any]) -> str:
    auth = robot.get("auth") if isinstance(robot.get("auth"), dict) else {}
    auth_name = auth.get("accountName") or auth.get("accountUid") or robot.get("authName") or robot.get("accountAlias") or "未绑定账号"
    auth_status = str(auth.get("status") or robot.get("authStatus") or "").upper()
    status_text = AUTH_STATUS_LABEL.get(auth_status, auth_status or "未设置授权")
    # 与参考稿一致使用横线分隔授权状态；数据来源和状态逻辑不变。
    return f"绑定账号：   {auth_name} - {status_text}"


def _expire_display(robot: Dict[str, Any]) -> str:
    value = robot.get("expireAt") or robot.get("expiredAt") or robot.get("expire_at") or robot.get("expiresAt")
    return str(value or "未设置")


def _diagnostics_visibility(robot: Dict[str, Any]) -> tuple[bool, bool, bool]:
    config = robot.get("config") if isinstance(robot.get("config"), dict) else {}
    runtime_policy = config.get("runtimePolicy") if isinstance(config.get("runtimePolicy"), dict) else {}
    diagnostics = runtime_policy.get("diagnostics") if isinstance(runtime_policy.get("diagnostics"), dict) else {}
    gui_log_enabled = diagnostics.get("guiLogEnabled") is not False
    interface_trace_enabled = diagnostics.get("interfaceTraceEnabled") is not False
    return gui_log_enabled, interface_trace_enabled, bool(gui_log_enabled or interface_trace_enabled)


def _badge_style(status: str) -> str:
    status = (status or "").upper()
    color = RUNTIME_BADGE_COLORS.get(status, "#94A3B8")
    return (
        f"background:{color};color:white;font-size:12px;font-weight:900;"
        "border-radius:9px;min-width:58px;min-height:30px;max-height:30px;padding:0px 7px;"
    )


def _tenant_choices_from_session(session: CoreNexusSession) -> list[TenantChoice]:
    choices: list[TenantChoice] = []
    seen: set[str] = set()
    for item in session.tenants or []:
        if not isinstance(item, dict):
            continue
        status = str(item.get("status") or "").upper()
        if status in {"DISABLED", "DELETED"}:
            continue
        tenant_id = str(item.get("tenantId") or item.get("tenant_id") or item.get("id") or "").strip()
        if not tenant_id or tenant_id in seen:
            continue
        seen.add(tenant_id)
        choices.append(TenantChoice(
            tenant_id=tenant_id,
            tenant_name=str(item.get("tenantName") or item.get("tenant_name") or item.get("name") or tenant_id),
            tenant_code=str(item.get("tenantCode") or item.get("tenant_code") or item.get("code") or ""),
            is_default=bool(item.get("isDefault") or item.get("is_default") or tenant_id == session.tenant_id),
        ))
    if not choices and session.tenant_id:
        choices.append(TenantChoice(tenant_id=str(session.tenant_id), tenant_name=_tenant_name_from_session(session) or str(session.tenant_id), is_default=True))
    return choices


def _session_user_name(session: CoreNexusSession) -> str:
    user = session.user or {}
    return str(user.get("displayName") or user.get("username") or user.get("email") or "已登录账号")


def _tenant_name_from_session(session: CoreNexusSession) -> str:
    user = session.user or {}
    tenant_id = session.tenant_id or str(user.get("tenantId") or "")
    if user.get("tenantName"):
        return str(user.get("tenantName"))
    for tenant in session.tenants or []:
        if not isinstance(tenant, dict):
            continue
        tid = str(tenant.get("tenantId") or tenant.get("id") or tenant.get("tenant_id") or "")
        if tenant_id and tid == tenant_id:
            return str(tenant.get("tenantName") or tenant.get("name") or tenant_id)
    return tenant_id


def _resolve_project_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def _to_qprocess_env(mapping: dict[str, str]) -> QProcessEnvironment:
    env = QProcessEnvironment()
    for key, value in mapping.items():
        env.insert(key, str(value))
    return env


def _decode_process_output(raw: bytes) -> str:
    if not raw:
        return ""
    for encoding in ("utf-8-sig", "utf-8", "gbk", "mbcs"):
        try:
            return raw.decode(encoding)
        except Exception:
            continue
    return raw.decode("utf-8", errors="replace")


def build_launch_command(cli_args: List[str]) -> Tuple[str, List[str]]:
    if getattr(sys, "frozen", False):
        return sys.executable, cli_args
    project_root = Path(__file__).resolve().parents[1]
    return sys.executable, ["-u", str(project_root / "main.py"), *cli_args]


def launch_gui() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName("Core-Nexus 截流机器人控制台")
    font = QFont()
    font.setPointSize(10)
    app.setFont(font)
    win = DesktopWorkbench()
    win.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(launch_gui())
