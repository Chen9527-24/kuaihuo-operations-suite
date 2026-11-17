from __future__ import annotations

import json


from app.services.runtime_config import (
    COMMENT_READY_HINTS,
    COMMON_BLOCKERS,
    DM_READY_HINTS,
    DOUYIN_COMMENT_READY_ROOT_SELECTORS,
    DOUYIN_DM_READY_ROOT_SELECTORS,
    LOGIN_HINTS,
)


def build_state_probe(module: str) -> str:
    ready_hints = DM_READY_HINTS if module == "dm" else COMMENT_READY_HINTS
    target_roots = list(DOUYIN_DM_READY_ROOT_SELECTORS) if module == "dm" else list(DOUYIN_COMMENT_READY_ROOT_SELECTORS)
    return f"""
(() => {{
  const emit = (payload) => {{
    try {{
      return JSON.stringify(payload || {{}});
    }} catch (err) {{
      return JSON.stringify({{
        ok: false,
        phase: 'legacy_ready_audit',
        status: 'js_error',
        url: location.href || '',
        title: document.title || '',
        readyHits: [],
        loginHits: [],
        sample: '',
        error: 'legacy stringify failed: ' + String(err),
      }});
    }}
  }};
  try {{
    const readyHints = {json.dumps(ready_hints, ensure_ascii=False)};
    const loginHints = {json.dumps(LOGIN_HINTS, ensure_ascii=False)};
    const targetRootSelectors = {json.dumps(target_roots, ensure_ascii=False)};
    const now = Date.now();

    const textOf = (node) => ((node && (node.innerText || node.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (node) => {{
      if (!node || !(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && parseFloat(style.opacity || '1') > 0.02
        && rect.width >= 2
        && rect.height >= 2;
    }};
    const rectOf = (node) => {{
      if (!node || !(node instanceof Element)) return {{x: 0, y: 0, w: 0, h: 0}};
      const rect = node.getBoundingClientRect();
      return {{x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height)}};
    }};

    if (!window.__matrixflowProbeObserver) {{
      const store = window.__matrixflowProbeStore = window.__matrixflowProbeStore || {{
        createdAt: now,
        mutationCount: 0,
        lastMutationTs: now,
      }};
      const target = document.documentElement || document.body;
      if (target && typeof MutationObserver !== 'undefined') {{
        const observer = new MutationObserver((mutations) => {{
          store.mutationCount += mutations.length || 1;
          store.lastMutationTs = Date.now();
        }});
        observer.observe(target, {{
          subtree: true,
          childList: true,
          attributes: true,
          characterData: false,
        }});
        window.__matrixflowProbeObserver = observer;
      }}
    }}

    const probeStore = window.__matrixflowProbeStore || {{createdAt: now, mutationCount: 0, lastMutationTs: now}};

    const rawText = textOf(document.body || document.documentElement || null);
    const text = rawText.slice(0, 3200);
    const url = location.href || '';
    const title = document.title || '';

    const readyHits = readyHints.filter(k => text.includes(k) || title.includes(k));
    const titleLoginHits = loginHints.filter(k => title.includes(k));

    const loginTextNodes = Array.from(document.querySelectorAll('button, [role="button"], a, span, div, p, h1, h2, h3, h4, label'))
      .filter(visible)
      .map((node) => {{
        const nodeText = textOf(node);
        if (!nodeText) return null;
        const hits = loginHints.filter(k => nodeText.includes(k));
        if (!hits.length) return null;
        return {{
          text: nodeText.slice(0, 60),
          hits,
          rect: rectOf(node),
        }};
      }})
      .filter(Boolean)
      .slice(0, 6);

    const qrCandidates = Array.from(document.querySelectorAll('canvas, img, svg'))
      .filter(visible)
      .map((node) => ({{node, rect: rectOf(node)}}))
      .filter((item) => item.rect.w >= 120 && item.rect.h >= 120)
      .slice(0, 4)
      .map((item) => item.rect);

    const targetRoots = targetRootSelectors.map((selector) => {{
      const node = document.querySelector(selector);
      return {{selector, found: !!node && visible(node), rect: node ? rectOf(node) : null}};
    }});
    const foundTargetRoots = targetRoots.filter(item => item.found);

    const storageKeys = [];
    const pushKeys = (storage) => {{
      try {{
        for (let i = 0; i < storage.length; i += 1) {{
          const key = storage.key(i);
          if (!key) continue;
          if (/(login|user|uid|passport|token|session|douyin|creator|sec_uid|csrf)/i.test(key)) {{
            storageKeys.push(key);
          }}
        }}
      }} catch (err) {{}}
    }};
    try {{ pushKeys(window.localStorage); }} catch (err) {{}}
    try {{ pushKeys(window.sessionStorage); }} catch (err) {{}}

    const loginUiVisible = loginTextNodes.length > 0 || (qrCandidates.length > 0 && (loginTextNodes.length > 0 || titleLoginHits.length > 0));
    const recentMutationMs = Math.max(0, now - Number(probeStore.lastMutationTs || now));
    const domBusy = recentMutationMs <= 4000 && Number(probeStore.mutationCount || 0) > 0;

    let status = 'unknown';
    if (readyHits.length > 0) {{
      status = 'module_ready';
    }} else if (foundTargetRoots.length > 0) {{
      status = 'module_mounting';
    }} else if (loginUiVisible || titleLoginHits.length > 0) {{
      status = 'login_wait';
    }} else if (url.includes('/creator-micro/home')) {{
      status = domBusy ? 'auth_in_progress' : 'module_redirect_home';
    }} else if (url.includes('/creator-micro/data/following/chat') || url.includes('/creator-micro/interactive/comment')) {{
      status = domBusy ? 'auth_in_progress' : 'module_target_loading';
    }} else if (url.includes('/creator-micro/')) {{
      status = domBusy || storageKeys.length > 0 ? 'auth_in_progress' : 'module_unknown_inside_creator';
    }}

    return emit({{
      ok: true,
      phase: 'legacy_ready_audit',
      status,
      url,
      title,
      readyHits,
      loginHits: Array.from(new Set([...titleLoginHits, ...loginTextNodes.flatMap(item => item.hits)])).slice(0, 12),
      sample: text.slice(0, 160),
      loginUiVisible,
      loginTextNodes,
      qrCandidates,
      targetRoots,
      storageKeys: Array.from(new Set(storageKeys)).slice(0, 20),
      mutationCount: Number(probeStore.mutationCount || 0),
      recentMutationMs,
    }});
  }} catch (err) {{
    return emit({{
      ok: false,
      phase: 'legacy_ready_audit',
      status: 'js_error',
      url: location.href || '',
      title: document.title || '',
      readyHits: [],
      loginHits: [],
      sample: '',
      error: String(err)
    }});
  }}
}})();
"""



def build_legacy_ready_audit_probe(module: str) -> str:
    ready_hints = DM_READY_HINTS if module == "dm" else COMMENT_READY_HINTS
    target_roots = list(DOUYIN_DM_READY_ROOT_SELECTORS) if module == "dm" else list(DOUYIN_COMMENT_READY_ROOT_SELECTORS)
    return f"""
(() => {{
  const emit = (payload) => {{
    try {{
      return JSON.stringify(payload || {{}});
    }} catch (err) {{
      return JSON.stringify({{
        ok: false,
        phase: 'legacy_ready_audit',
        status: 'js_error',
        url: location.href || '',
        title: document.title || '',
        readyHits: [],
        targetRoots: [],
        error: 'legacy stringify failed: ' + String(err),
      }});
    }}
  }};
  try {{
    const readyHints = {json.dumps(ready_hints, ensure_ascii=False)};
    const targetRootSelectors = {json.dumps(target_roots, ensure_ascii=False)};
    const textOf = (node) => ((node && (node.innerText || node.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (node) => {{
      if (!node || !(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && parseFloat(style.opacity || '1') > 0.02
        && rect.width >= 2
        && rect.height >= 2;
    }};
    const rectOf = (node) => {{
      if (!node || !(node instanceof Element)) return {{x: 0, y: 0, w: 0, h: 0}};
      const rect = node.getBoundingClientRect();
      return {{x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height)}};
    }};

    const url = location.href || '';
    const title = document.title || '';
    const sampleSource = textOf(document.body || document.documentElement || null).slice(0, 1200);
    const readyHits = readyHints.filter(k => sampleSource.includes(k) || title.includes(k));
    const targetRoots = targetRootSelectors.map((selector) => {{
      const node = document.querySelector(selector);
      return {{selector, found: !!node && visible(node), rect: node ? rectOf(node) : null}};
    }});
    const foundRootSelectors = targetRoots.filter(item => item && item.found).map(item => String(item.selector || ''));

    if (!readyHits.length) {{
      if (foundRootSelectors.some(sel => targetRootSelectors.includes(sel))) {{
        readyHits.push('legacy_root_ready');
      }}
    }}

    let status = 'unknown';
    if (readyHits.length > 0) {{
      status = 'module_ready';
    }} else if (foundRootSelectors.length > 0) {{
      status = 'module_mounting';
    }} else if (url.includes('/creator-micro/data/following/chat') || url.includes('/creator-micro/interactive/comment')) {{
      status = 'module_target_loading';
    }}

    return emit({{
      ok: true,
      phase: 'legacy_ready_audit',
      status,
      url,
      title,
      readyHits,
      loginHits: [],
      sample: sampleSource.slice(0, 160),
      targetRoots,
      storageKeys: [],
      mutationCount: 0,
      recentMutationMs: null,
    }});
  }} catch (err) {{
    return emit({{
      ok: false,
      phase: 'legacy_ready_audit',
      status: 'js_error',
      url: location.href || '',
      title: document.title || '',
      readyHits: [],
      targetRoots: [],
      error: String(err),
    }});
  }}
}})();
"""




def build_state_meta_probe(module: str) -> str:
    return r"""
(() => {
  const emit = (payload) => {
    try {
      return JSON.stringify(payload || {});
    } catch (err) {
      return JSON.stringify({
        ok: false,
        phase: 'meta',
        url: location.href || '',
        title: document.title || '',
        error: `meta stringify failed: ${String(err)}`,
      });
    }
  };
  try {
    const now = Date.now();
    const url = location.href || '';
    const title = document.title || '';
    if (!window.__matrixflowProbeObserver) {
      const store = window.__matrixflowProbeStore = window.__matrixflowProbeStore || {
        createdAt: now,
        mutationCount: 0,
        lastMutationTs: now,
      };
      const target = document.documentElement || document.body;
      if (target && typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver((mutations) => {
          store.mutationCount += mutations.length || 1;
          store.lastMutationTs = Date.now();
        });
        observer.observe(target, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: false,
        });
        window.__matrixflowProbeObserver = observer;
      }
    }
    const probeStore = window.__matrixflowProbeStore || {createdAt: now, mutationCount: 0, lastMutationTs: now};
    const storageKeys = [];
    const pushKeys = (storage) => {
      try {
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i);
          if (!key) continue;
          if (/(login|user|uid|passport|token|session|douyin|creator|sec_uid|csrf)/i.test(key)) {
            storageKeys.push(key);
          }
        }
      } catch (err) {}
    };
    try { pushKeys(window.localStorage); } catch (err) {}
    try { pushKeys(window.sessionStorage); } catch (err) {}
    const recentMutationMs = Math.max(0, now - Number(probeStore.lastMutationTs || now));
    return emit({
      ok: true,
      phase: 'meta',
      url,
      title,
      storageKeys: Array.from(new Set(storageKeys)).slice(0, 20),
      mutationCount: Number(probeStore.mutationCount || 0),
      recentMutationMs,
      domBusy: recentMutationMs <= 4000 && Number(probeStore.mutationCount || 0) > 0,
    });
  } catch (err) {
    return emit({
      ok: false,
      phase: 'meta',
      url: location.href || '',
      title: document.title || '',
      error: String(err),
    });
  }
})();
"""


def build_state_dom_probe(module: str) -> str:
    ready_hints = DM_READY_HINTS if module == "dm" else COMMENT_READY_HINTS
    target_roots = list(DOUYIN_DM_READY_ROOT_SELECTORS) if module == "dm" else list(DOUYIN_COMMENT_READY_ROOT_SELECTORS)
    return f"""
(() => {{
  const emit = (payload) => {{
    try {{
      const base = {{
        ok: false,
        phase: 'dom',
        readyHits: [],
        loginHits: [],
        loginUiVisible: false,
        loginTextNodes: [],
        qrCandidates: [],
        targetRoots: [],
        sample: '',
        partialErrors: [],
      }};
      const merged = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? {{ ...base, ...payload }} : {{
        ...base,
        error: 'dom payload non-object',
        detail: {{ rawType: typeof payload }},
      }};
      return JSON.stringify(merged);
    }} catch (err) {{
      return JSON.stringify({{
        ok: false,
        phase: 'dom',
        readyHits: [],
        loginHits: [],
        loginUiVisible: false,
        loginTextNodes: [],
        qrCandidates: [],
        targetRoots: [],
        sample: '',
        partialErrors: ['dom stringify failed: ' + String(err)],
      }});
    }}
  }};
  try {{
    const readyHints = {json.dumps(ready_hints, ensure_ascii=False)};
    const loginHints = {json.dumps(LOGIN_HINTS, ensure_ascii=False)};
    const targetRootSelectors = {json.dumps(target_roots, ensure_ascii=False)};
    const partialErrors = [];
    const textOf = (node) => ((node && (node.innerText || node.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (node) => {{
      if (!node || !(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && parseFloat(style.opacity || '1') > 0.02
        && rect.width >= 2
        && rect.height >= 2;
    }};
    const rectOf = (node) => {{
      if (!node || !(node instanceof Element)) return {{x: 0, y: 0, w: 0, h: 0}};
      const rect = node.getBoundingClientRect();
      return {{x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height)}};
    }};
    const safeCollect = (label, factory, fallback) => {{
      try {{
        const value = factory();
        if (value === undefined || value === null) {{
          partialErrors.push(label + ': nullish result');
          return fallback;
        }}
        if (typeof value === 'string') {{
          partialErrors.push(label + ': string result');
          return fallback;
        }}
        return value;
      }} catch (err) {{
        partialErrors.push(label + ': ' + String(err));
        return fallback;
      }}
    }};

    const rawText = safeCollect('rawText', () => textOf(document.body || document.documentElement || null), '');
    const text = String(rawText || '').slice(0, 3200);
    const title = String(document.title || '');
    const readyHits = safeCollect('readyHits', () => readyHints.filter(k => text.includes(k) || title.includes(k)), []);
    const titleLoginHits = safeCollect('titleLoginHits', () => loginHints.filter(k => title.includes(k)), []);
    const loginTextNodes = safeCollect('loginTextNodes', () => Array.from(document.querySelectorAll('button, [role="button"], a, span, div, p, h1, h2, h3, h4, label'))
      .filter(visible)
      .map((node) => {{
        const nodeText = textOf(node);
        if (!nodeText) return null;
        const hits = loginHints.filter(k => nodeText.includes(k));
        if (!hits.length) return null;
        return {{
          text: nodeText.slice(0, 60),
          hits,
          rect: rectOf(node),
        }};
      }})
      .filter(Boolean)
      .slice(0, 6), []);
    const qrCandidates = safeCollect('qrCandidates', () => Array.from(document.querySelectorAll('canvas, img, svg'))
      .filter(visible)
      .map((node) => ({{node, rect: rectOf(node)}}))
      .filter((item) => item.rect.w >= 120 && item.rect.h >= 120)
      .slice(0, 4)
      .map((item) => item.rect), []);
    const targetRoots = safeCollect('targetRoots', () => targetRootSelectors.map((selector) => {{
      try {{
        const node = document.querySelector(selector);
        return {{selector, found: !!node && visible(node), rect: node ? rectOf(node) : null}};
      }} catch (err) {{
        partialErrors.push('targetRoot:' + selector + ': ' + String(err));
        return {{selector, found: false, rect: null}};
      }}
    }}), []);
    const loginHits = safeCollect('loginHits', () => Array.from(new Set([...(Array.isArray(titleLoginHits) ? titleLoginHits : []), ...((Array.isArray(loginTextNodes) ? loginTextNodes : []).flatMap(item => item && Array.isArray(item.hits) ? item.hits : []))])).slice(0, 12), []);
    const loginUiVisible = Boolean((Array.isArray(loginTextNodes) ? loginTextNodes.length : 0) > 0 || ((Array.isArray(qrCandidates) ? qrCandidates.length : 0) > 0 && (((Array.isArray(loginTextNodes) ? loginTextNodes.length : 0) > 0) || ((Array.isArray(titleLoginHits) ? titleLoginHits.length : 0) > 0))));

    return emit({{
      ok: true,
      phase: 'dom_minimal',
      readyHits: Array.isArray(readyHits) ? readyHits : [],
      loginHits: Array.isArray(loginHits) ? loginHits : [],
      loginUiVisible,
      loginTextNodes: Array.isArray(loginTextNodes) ? loginTextNodes : [],
      qrCandidates: Array.isArray(qrCandidates) ? qrCandidates : [],
      targetRoots: Array.isArray(targetRoots) ? targetRoots : [],
      sample: text.slice(0, 160),
      partialErrors,
    }});
  }} catch (err) {{
    return emit({{
      ok: false,
      phase: 'dom',
      error: String(err),
      readyHits: [],
      loginHits: [],
      loginTextNodes: [],
      qrCandidates: [],
      targetRoots: [],
      sample: '',
      partialErrors: ['dom catch: ' + String(err)],
    }});
  }}
}})();
"""

def build_dismiss_blockers_script() -> str:
    return f"""
(() => {{
  try {{
    const targets = {json.dumps(COMMON_BLOCKERS, ensure_ascii=False)};
    const nodes = Array.from(document.querySelectorAll('button, [role="button"], span, div, a'));
    let clicked = [];
    for (const node of nodes) {{
      const txt = (node.innerText || '').trim();
      if (!txt) continue;
      if (targets.includes(txt)) {{
        try {{ node.click(); clicked.push(txt); }} catch (e) {{}}
      }}
    }}
    return clicked;
  }} catch (err) {{
    return [];
  }}
}})();
"""



def build_dm_unread_light_probe_script() -> str:
    """轻量未读检测：空闲态检查左侧未读，同时检测当前打开会话的新入站消息。"""
    return r"""
(() => {
  try {
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.02 && rect.width >= 2 && rect.height >= 2;
    };
    const rectOf = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)};
    };
    const collectUnreadSignals = (el) => {
      const rowRect = rectOf(el);
      const nodes = [el, ...Array.from(el.querySelectorAll('*')).slice(0, 180)];
      const lower = (value) => (((value || '') + '').toLowerCase());
      const compact = (value) => (((value || '') + '').replace(/\s+/g, '').trim());
      const attrTextOf = (node) => [
        node.getAttribute('aria-label'), node.getAttribute('title'), node.getAttribute('alt'),
        node.getAttribute('data-count'), node.getAttribute('data-badge'), node.getAttribute('data-unread'),
        node.getAttribute('data-message-count'), node.getAttribute('aria-valuetext'), node.getAttribute('aria-description'),
      ].filter(Boolean).join(' ');
      const classTextOf = (node) => (typeof node.className === 'string' ? node.className : '');
      const parseRgb = (value) => {
        const m = String(value || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
        if (!m) return null;
        return {r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4])};
      };
      const redish = (value) => {
        const rgb = parseRgb(value);
        return !!(rgb && rgb.a > 0.15 && rgb.r >= 180 && rgb.g <= 125 && rgb.b <= 125 && rgb.r > rgb.g * 1.25 && rgb.r > rgb.b * 1.25);
      };
      const pseudoContent = (node, pseudo) => {
        try {
          const content = window.getComputedStyle(node, pseudo).content || '';
          return content && content !== 'none' && content !== 'normal' ? content.replace(/^['\"]|['\"]$/g, '').trim() : '';
        } catch (e) { return ''; }
      };
      const badgeTexts = [];
      const classHints = [];
      const attrHints = [];
      let unreadDotFound = false;
      let unreadAttrFound = false;
      let unreadClassFound = false;
      let pseudoUnreadFound = false;
      let redDotCount = 0;
      let maxFontWeight = 0;
      for (const node of nodes) {
        if (!node || !(node instanceof Element)) continue;
        const rect = rectOf(node);
        let style = null;
        try { style = window.getComputedStyle(node); } catch (e) { style = null; }
        const cls = classTextOf(node);
        const attrs = attrTextOf(node);
        if (node !== el && style && !attrs && (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') <= 0.02)) continue;
        if (style) {
          const weightRaw = style.fontWeight || '0';
          const weight = Number(weightRaw) || (String(weightRaw).toLowerCase() === 'bold' ? 700 : 0);
          maxFontWeight = Math.max(maxFontWeight, weight);
        }
        const hintText = lower(cls + ' ' + attrs);
        const hasBadgeHint = /(semi-badge|badge|unread|dot|red-dot|notice|remind|count|new-message|message-count|未读|红点|新消息)/i.test(hintText);
        if (hasBadgeHint && classHints.length < 8) classHints.push(cls.slice(0, 100));
        if (/(未读|新消息|条新消息|unread|new message|unread message)/i.test(attrs)) {
          unreadAttrFound = true;
          if (attrHints.length < 6) attrHints.push(attrs.slice(0, 100));
        }
        if (/(^|[-_\s])(unread|newmsg|new-message|has-new|unread-dot|unread-count)([-_\s]|$)|未读/i.test(cls)) {
          unreadClassFound = true;
        }
        const nodeText = compact(textOf(node));
        const attrCompact = compact(attrs);
        const rowRight = !!(rowRect && rect && rect.x >= rowRect.x + rowRect.w * 0.55);
        const small = !!(rect && rect.w >= 2 && rect.h >= 2 && rect.w <= 34 && rect.h <= 28);
        if (/^\d{1,3}$/.test(nodeText) && (hasBadgeHint || (small && rowRight))) badgeTexts.push(nodeText);
        if (/^\d{1,3}$/.test(attrCompact) || /(\d{1,3})(条)?未读|未读(\d{1,3})?|新消息/i.test(attrCompact)) badgeTexts.push(attrCompact);
        const before = pseudoContent(node, '::before');
        const after = pseudoContent(node, '::after');
        for (const content of [before, after]) {
          const pc = compact(content);
          if (!pc) continue;
          if (/^\d{1,3}$/.test(pc) || /未读|新消息/i.test(pc)) {
            pseudoUnreadFound = true;
            badgeTexts.push(pc);
          }
        }
        if (hasBadgeHint && /(dot|red|unread|未读|红点)/i.test(hintText)) unreadDotFound = true;
        if (style && small && (hasBadgeHint || rowRight) && (redish(style.backgroundColor) || redish(style.borderColor) || redish(style.color))) {
          unreadDotFound = true;
          redDotCount += 1;
        }
      }
      const rowText = textOf(el);
      const leadingUnread = /^\s*\d{1,3}\s+/.test(rowText) && !/^\s*\d{1,2}[:：]\d{2}/.test(rowText);
      const uniqBadgeTexts = Array.from(new Set(badgeTexts.map(x => String(x || '').trim()).filter(Boolean))).slice(0, 6);
      const reasons = [];
      if (leadingUnread) reasons.push('leading_number');
      if (uniqBadgeTexts.some(txt => /^\d{1,3}$/.test(txt) || /未读|新消息/i.test(txt))) reasons.push('badge_text');
      if (unreadDotFound) reasons.push('dot_or_red_badge');
      if (unreadAttrFound) reasons.push('aria_or_data_unread');
      if (unreadClassFound) reasons.push('class_unread');
      if (pseudoUnreadFound) reasons.push('pseudo_content');
      return {
        unreadFlag: reasons.length > 0,
        unreadBadge: uniqBadgeTexts.join('') || '',
        unreadDot: unreadDotFound,
        unreadReason: reasons.join('|'),
        unreadSignals: {
          badgeTexts: uniqBadgeTexts,
          redDotCount,
          unreadAttrFound,
          unreadClassFound,
          pseudoUnreadFound,
          maxFontWeight,
          classHints: classHints.filter(Boolean).slice(0, 4),
          attrHints: attrHints.filter(Boolean).slice(0, 4),
        },
        possibleUnreadFlag: reasons.length > 0 || (maxFontWeight >= 650 && (unreadClassFound || unreadAttrFound || unreadDotFound)),
      };
    };
    const activePane = document.querySelector('.chat-content.semi-tabs-pane-active[aria-hidden="false"]')
      || document.querySelector('.chat-content.semi-tabs-pane-active')
      || document.querySelector('.container-_r15W6.chat-container-heHrxU')
      || document;
    const tabNodes = Array.from(document.querySelectorAll('[role="tab"], .sub-tab-item-LMD8co')).filter(visible);
    const tabs = tabNodes.map((el) => ({
      text: textOf(el),
      selected: el.getAttribute('aria-selected') === 'true' || (typeof el.className === 'string' && el.className.includes('active')),
      rect: rectOf(el),
    })).filter(item => ['全部', '全部私信', '朋友私信', '陌生人私信', '群消息'].includes(item.text));
    const activeTabText = (tabs.find(item => item && item.selected)?.text || '').trim();
    const sessionEls = Array.from(activePane?.querySelectorAll('li[role="list-item"].semi-list-item') || []).filter(visible);
    const sessionCandidates = sessionEls.map((el, i) => {
      const rawText = textOf(el);
      const unread = collectUnreadSignals(el);
      const nickname = textOf(el.querySelector('.item-header-name-eukBdz, [class*="header-name"], [class*="nickname"], [class*="nick-name"]')) || rawText.replace(/^\d+\s*/, '').split(/\s+/).slice(0, 1).join(' ');
      const timeText = textOf(el.querySelector('.item-header-time-XtnnBd, [class*="header-time"], [class*="time"]'));
      const summary = textOf(el.querySelector('.text-W2RFz4, .item-content-BSDfEh, [class*="item-content"], [class*="content"], [class*="summary"], [class*="desc"]')).slice(0, 80);
      return {
        domIndex: i,
        nickname,
        timeText,
        summary,
        unreadFlag: unread.unreadFlag,
        possibleUnreadFlag: unread.possibleUnreadFlag,
        unreadBadge: unread.unreadBadge,
        unreadDot: unread.unreadDot,
        unreadReason: unread.unreadReason,
        unreadSignals: unread.unreadSignals,
        rect: rectOf(el),
        sessionKey: [nickname, timeText, summary].filter(Boolean).join(' | ').slice(0, 180),
        selected: (typeof el.className === 'string' && el.className.includes('active-BApUO3')) || el.getAttribute('aria-selected') === 'true'
      };
    });
    const unreadCandidates = sessionCandidates.filter(item => item.unreadFlag).slice(0, 3);
    const selectedSession = sessionCandidates.find(item => item.selected) || null;

    const messagePanel = document.querySelector('.box-container-yGo0TJ') || document.querySelector('.box-content-qyCVPY')?.parentElement || null;
    const messageContent = messagePanel?.querySelector('.box-content-qyCVPY') || null;
    const currentHeaderName = textOf(messagePanel?.querySelector('.box-header-name-z3_MyF') || null);
    const conversationType = activeTabText === '群消息' ? 'group' : 'private';
    const groupName = conversationType === 'group' ? ((selectedSession && selectedSession.nickname) || currentHeaderName || '') : '';
    const bubbleEls = Array.from(messageContent?.querySelectorAll('.box-item-W0TV01 .box-item-message-r0L2l6') || []).filter(visible);
    const messageRect = messageContent ? rectOf(messageContent) : null;
    const intersects = (rect, bounds) => {
      if (!rect || !bounds) return false;
      return rect.x < bounds.x + bounds.w && rect.x + rect.w > bounds.x && rect.y < bounds.y + bounds.h && rect.y + rect.h > bounds.y;
    };
    const parseGroup = (rawText, el, isMine) => {
      const normalized = (rawText || '').replace(/\s+/g, ' ').trim();
      if (conversationType !== 'group' || isMine || !normalized) return {senderName: '', messageText: normalized, structuredText: normalized};
      const authorNode = el.querySelector('[class*="aweme-author-name"], [class*="author-name"], [class*="nickname"], [class*="nick-name"], [class*="name"]');
      const authorText = textOf(authorNode);
      const parts = normalized.split(/\s+/).filter(Boolean);
      let senderName = authorText || '';
      let messageText = normalized;
      if (!senderName && parts.length >= 2) {
        senderName = parts[0];
        messageText = parts.slice(1).join(' ').trim() || normalized;
      }
      if (senderName && messageText.startsWith(senderName)) {
        messageText = messageText.slice(senderName.length).trim() || messageText;
      }
      if (groupName && senderName === groupName) {
        senderName = '';
        messageText = normalized;
      }
      return {senderName, messageText, structuredText: [groupName ? `群名: ${groupName}` : '', senderName ? `发送人: ${senderName}` : '', `消息正文: ${messageText || normalized}`].filter(Boolean).join('\n')};
    };
    const bubbles = bubbleEls.map((el) => {
      const row = el.closest('.box-item-W0TV01');
      const isMine = !!(row && row.classList.contains('is-me-cb9NAa'));
      const rawText = textOf(el.querySelector('.text-prz9K6, .text-item-message-zUNhSB, pre') || el).slice(0, 200);
      const info = parseGroup(rawText, el, isMine);
      const rect = rectOf(el);
      return {side: isMine ? 'right' : 'left', text: rawText, messageText: info.messageText, senderName: info.senderName, structuredText: info.structuredText, viewportVisible: intersects(rect, messageRect), rect};
    }).filter(item => item.viewportVisible);
    const latestIncoming = [...bubbles].reverse().find(item => {
      if (item.side !== 'left' || !(item.messageText || item.text)) return false;
      if (conversationType !== 'group') return true;
      const msg = (item.messageText || item.text || '').trim();
      const sender = (item.senderName || '').trim();
      return !!msg && (!sender || msg !== sender);
    }) || null;
    const latestOutgoing = [...bubbles].reverse().find(item => item.side === 'right' && item.text) || null;
    const latestIncomingText = latestIncoming ? ((conversationType === 'group' ? (latestIncoming.messageText || latestIncoming.text) : latestIncoming.text) || '') : '';
    const currentConversation = {
      hasMessagePanel: !!messagePanel,
      activeTabText,
      conversationType,
      headerName: conversationType === 'group' ? groupName : currentHeaderName,
      selectedSessionKey: selectedSession ? selectedSession.sessionKey : '',
      selectedNickname: selectedSession ? selectedSession.nickname : '',
      selectedSessionSelected: !!(selectedSession && selectedSession.selected),
      latestIncomingText,
      latestIncomingStructuredText: latestIncoming ? ((conversationType === 'group' ? (latestIncoming.structuredText || latestIncomingText) : latestIncoming.text) || '') : '',
      latestOutgoingText: latestOutgoing ? latestOutgoing.text : '',
      groupName: conversationType === 'group' ? groupName : '',
      groupSenderName: conversationType === 'group' && latestIncoming ? (latestIncoming.senderName || '') : '',
      groupMessageText: conversationType === 'group' ? latestIncomingText : '',
    };
    return {
      ok: true,
      module: 'dm',
      mode: 'light_unread_probe',
      url: location.href,
      activeTabText,
      tabTexts: tabs.map(t => t.text),
      sessionCandidates: sessionEls.length,
      unreadCandidates,
      unreadCount: unreadCandidates.length,
      hasUnread: unreadCandidates.length > 0,
      currentConversation,
      hasCurrentConversationIncoming: !!(currentConversation.hasMessagePanel && currentConversation.latestIncomingText),
      ts: Date.now(),
    };
  } catch (err) {
    return {ok: false, module: 'dm', mode: 'light_unread_probe', error: String(err), url: location.href};
  }
})();
"""

def build_dm_inspect_script() -> str:
    return r"""
(() => {
  try {
    const serialize = (value) => {
      try {
        return JSON.stringify(value);
      } catch (err) {
        return JSON.stringify({ok: false, module: 'dm', error: 'serialize_error: ' + String(err), url: location.href});
      }
    };
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.02 && rect.width >= 2 && rect.height >= 2;
    };
    const rectOf = (el) => {
      const r = el.getBoundingClientRect();
      return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)};
    };
    const collectUnreadSignals = (el) => {
      const rowRect = rectOf(el);
      const nodes = [el, ...Array.from(el.querySelectorAll('*')).slice(0, 180)];
      const lower = (value) => (((value || '') + '').toLowerCase());
      const compact = (value) => (((value || '') + '').replace(/\s+/g, '').trim());
      const attrTextOf = (node) => [
        node.getAttribute('aria-label'), node.getAttribute('title'), node.getAttribute('alt'),
        node.getAttribute('data-count'), node.getAttribute('data-badge'), node.getAttribute('data-unread'),
        node.getAttribute('data-message-count'), node.getAttribute('aria-valuetext'), node.getAttribute('aria-description'),
      ].filter(Boolean).join(' ');
      const classTextOf = (node) => (typeof node.className === 'string' ? node.className : '');
      const parseRgb = (value) => {
        const m = String(value || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
        if (!m) return null;
        return {r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4])};
      };
      const redish = (value) => {
        const rgb = parseRgb(value);
        return !!(rgb && rgb.a > 0.15 && rgb.r >= 180 && rgb.g <= 125 && rgb.b <= 125 && rgb.r > rgb.g * 1.25 && rgb.r > rgb.b * 1.25);
      };
      const pseudoContent = (node, pseudo) => {
        try {
          const content = window.getComputedStyle(node, pseudo).content || '';
          return content && content !== 'none' && content !== 'normal' ? content.replace(/^['\"]|['\"]$/g, '').trim() : '';
        } catch (e) { return ''; }
      };
      const badgeTexts = [];
      const classHints = [];
      const attrHints = [];
      let unreadDotFound = false;
      let unreadAttrFound = false;
      let unreadClassFound = false;
      let pseudoUnreadFound = false;
      let redDotCount = 0;
      let maxFontWeight = 0;
      for (const node of nodes) {
        if (!node || !(node instanceof Element)) continue;
        const rect = rectOf(node);
        let style = null;
        try { style = window.getComputedStyle(node); } catch (e) { style = null; }
        const cls = classTextOf(node);
        const attrs = attrTextOf(node);
        if (node !== el && style && !attrs && (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') <= 0.02)) continue;
        if (style) {
          const weightRaw = style.fontWeight || '0';
          const weight = Number(weightRaw) || (String(weightRaw).toLowerCase() === 'bold' ? 700 : 0);
          maxFontWeight = Math.max(maxFontWeight, weight);
        }
        const hintText = lower(cls + ' ' + attrs);
        const hasBadgeHint = /(semi-badge|badge|unread|dot|red-dot|notice|remind|count|new-message|message-count|未读|红点|新消息)/i.test(hintText);
        if (hasBadgeHint && classHints.length < 8) classHints.push(cls.slice(0, 100));
        if (/(未读|新消息|条新消息|unread|new message|unread message)/i.test(attrs)) {
          unreadAttrFound = true;
          if (attrHints.length < 6) attrHints.push(attrs.slice(0, 100));
        }
        if (/(^|[-_\s])(unread|newmsg|new-message|has-new|unread-dot|unread-count)([-_\s]|$)|未读/i.test(cls)) {
          unreadClassFound = true;
        }
        const nodeText = compact(textOf(node));
        const attrCompact = compact(attrs);
        const rowRight = !!(rowRect && rect && rect.x >= rowRect.x + rowRect.w * 0.55);
        const small = !!(rect && rect.w >= 2 && rect.h >= 2 && rect.w <= 34 && rect.h <= 28);
        if (/^\d{1,3}$/.test(nodeText) && (hasBadgeHint || (small && rowRight))) badgeTexts.push(nodeText);
        if (/^\d{1,3}$/.test(attrCompact) || /(\d{1,3})(条)?未读|未读(\d{1,3})?|新消息/i.test(attrCompact)) badgeTexts.push(attrCompact);
        const before = pseudoContent(node, '::before');
        const after = pseudoContent(node, '::after');
        for (const content of [before, after]) {
          const pc = compact(content);
          if (!pc) continue;
          if (/^\d{1,3}$/.test(pc) || /未读|新消息/i.test(pc)) {
            pseudoUnreadFound = true;
            badgeTexts.push(pc);
          }
        }
        if (hasBadgeHint && /(dot|red|unread|未读|红点)/i.test(hintText)) unreadDotFound = true;
        if (style && small && (hasBadgeHint || rowRight) && (redish(style.backgroundColor) || redish(style.borderColor) || redish(style.color))) {
          unreadDotFound = true;
          redDotCount += 1;
        }
      }
      const rowText = textOf(el);
      const leadingUnread = /^\s*\d{1,3}\s+/.test(rowText) && !/^\s*\d{1,2}[:：]\d{2}/.test(rowText);
      const uniqBadgeTexts = Array.from(new Set(badgeTexts.map(x => String(x || '').trim()).filter(Boolean))).slice(0, 6);
      const reasons = [];
      if (leadingUnread) reasons.push('leading_number');
      if (uniqBadgeTexts.some(txt => /^\d{1,3}$/.test(txt) || /未读|新消息/i.test(txt))) reasons.push('badge_text');
      if (unreadDotFound) reasons.push('dot_or_red_badge');
      if (unreadAttrFound) reasons.push('aria_or_data_unread');
      if (unreadClassFound) reasons.push('class_unread');
      if (pseudoUnreadFound) reasons.push('pseudo_content');
      return {
        unreadFlag: reasons.length > 0,
        unreadBadge: uniqBadgeTexts.join('') || '',
        unreadDot: unreadDotFound,
        unreadReason: reasons.join('|'),
        unreadSignals: {
          badgeTexts: uniqBadgeTexts,
          redDotCount,
          unreadAttrFound,
          unreadClassFound,
          pseudoUnreadFound,
          maxFontWeight,
          classHints: classHints.filter(Boolean).slice(0, 4),
          attrHints: attrHints.filter(Boolean).slice(0, 4),
        },
        possibleUnreadFlag: reasons.length > 0 || (maxFontWeight >= 650 && (unreadClassFound || unreadAttrFound || unreadDotFound)),
      };
    };

    const pathHint = (el) => {
      if (!el || !(el instanceof Element)) return '';
      const parts = [];
      let cur = el;
      for (let i = 0; i < 5 && cur; i += 1) {
        let part = (cur.tagName || '').toLowerCase();
        if (!part) break;
        if (cur.id) part += '#' + cur.id;
        const cls = (typeof cur.className === 'string' ? cur.className : '')
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 3);
        if (cls.length) part += '.' + cls.join('.');
        parts.push(part);
        cur = cur.parentElement;
      }
      return parts.join(' <- ');
    };
    const uniqBy = (items, keyFn) => {
      const map = new Map();
      items.forEach((item) => {
        const key = keyFn(item);
        if (!map.has(key)) map.set(key, item);
      });
      return Array.from(map.values());
    };
    const clickable = (el) => {
      if (!el || !(el instanceof Element)) return false;
      const tag = (el.tagName || '').toLowerCase();
      const role = el.getAttribute('role') || '';
      const style = window.getComputedStyle(el);
      return ['a', 'button', 'input', 'textarea'].includes(tag)
        || role === 'button'
        || role === 'link'
        || el.tabIndex >= 0
        || style.cursor === 'pointer';
    };

    // C.1 identity diagnostics: collect only deterministic hashes and field names.
    // Raw attribute values, links and React props never leave this page script.
    const diagnosticHash = (value) => {
      const text = String(value ?? '').trim();
      if (!text) return '';
      let h1 = 0x811c9dc5;
      let h2 = 0x9e3779b9;
      for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i);
        h1 ^= code;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= code + i;
        h2 = Math.imul(h2, 0x85ebca6b);
      }
      const hex = (value32) => (value32 >>> 0).toString(16).padStart(8, '0');
      return `${hex(h1)}${hex(h2)}`;
    };
    const diagnosticCandidate = (source, key, value) => {
      const text = String(value ?? '').trim();
      if (!text) return null;
      return {source, key, hash: diagnosticHash(text), length: text.length};
    };
    const collectIdentityCandidates = (nodes) => {
      const out = [];
      const seen = new Set();
      const push = (candidate) => {
        if (!candidate || !candidate.hash) return;
        const signature = `${candidate.source}|${candidate.key}|${candidate.hash}`;
        if (seen.has(signature) || out.length >= 16) return;
        seen.add(signature);
        out.push(candidate);
      };
      const identityAttr = /^(?:id|data-(?:id|key|row-key|item-key|item-id|conversation-id|session-id|chat-id|peer-id|user-id|uid|sec-uid))$/i;
      const identityProp = /(?:^id$|(?:conversation|session|chat|peer|user|uid|secuid|item|row).*(?:id|key)$)/i;
      const roots = Array.isArray(nodes) ? nodes : [nodes];
      const inspectNode = (node, sourcePrefix) => {
        if (!node || !(node instanceof Element)) return;
        try {
          let current = node;
          for (let depth = 0; current && depth < 3; depth += 1, current = current.parentElement) {
            for (const attr of Array.from(current.attributes || [])) {
              if (identityAttr.test(attr.name || '')) {
                push(diagnosticCandidate(`${sourcePrefix}:attr:${depth}`, attr.name, attr.value));
              }
            }
            const hrefNodes = [];
            if ((current.tagName || '').toLowerCase() === 'a' && current.getAttribute('href')) hrefNodes.push(current);
            if (depth === 0) hrefNodes.push(...Array.from(current.querySelectorAll('a[href]')).slice(0, 3));
            for (const link of hrefNodes) {
              const href = link.getAttribute('href') || '';
              push(diagnosticCandidate(`${sourcePrefix}:href:${depth}`, 'href', href));
            }
            for (const ownKey of Object.getOwnPropertyNames(current)) {
              if (!ownKey.startsWith('__reactProps$')) continue;
              let props = null;
              try { props = current[ownKey]; } catch (e) { props = null; }
              if (!props || typeof props !== 'object') continue;
              for (const [propKey, propValue] of Object.entries(props)) {
                if (!identityProp.test(String(propKey || ''))) continue;
                if (!['string', 'number'].includes(typeof propValue)) continue;
                push(diagnosticCandidate(`${sourcePrefix}:react:${depth}`, String(propKey), propValue));
              }
            }
          }
        } catch (e) {
          // Diagnostics must never break the normal DM inspection result.
        }
      };
      roots.forEach((node, index) => inspectNode(node, `node${index}`));
      return out;
    };

    const activePane = document.querySelector('.chat-content.semi-tabs-pane-active[aria-hidden="false"]')
      || document.querySelector('.chat-content.semi-tabs-pane-active')
      || document.querySelector('.container-_r15W6.chat-container-heHrxU');

    const tabNodes = Array.from(document.querySelectorAll('[role="tab"], .sub-tab-item-LMD8co')).filter(visible);
    const tabs = tabNodes.map((el) => ({
      text: textOf(el),
      selected: el.getAttribute('aria-selected') === 'true' || (typeof el.className === 'string' && el.className.includes('active')),
      rect: rectOf(el),
      hint: pathHint(el),
    })).filter(item => ['全部', '全部私信', '朋友私信', '陌生人私信', '群消息'].includes(item.text));

    const leftPanel = activePane?.querySelector('.list-zrsZ82')
      || activePane?.querySelector('.semi-list')
      || activePane?.querySelector('.ReactVirtualized__List')
      || null;
    const listScroller = leftPanel?.querySelector('.ReactVirtualized__Grid.ReactVirtualized__List, .ReactVirtualized__Grid')
      || activePane?.querySelector('.list-zrsZ82 .ReactVirtualized__Grid.ReactVirtualized__List, .list-zrsZ82 .ReactVirtualized__Grid')
      || null;

    const sessionEls = Array.from(activePane?.querySelectorAll('li[role="list-item"].semi-list-item') || [])
      .filter(visible);

    const sessionCandidates = sessionEls.map((el, domIndex) => {
      const nicknameNode = el.querySelector('.item-header-name-eukBdz, [class*="header-name"], [class*="nickname"], [class*="nick-name"]');
      const timeNode = el.querySelector('.item-header-time-XtnnBd, [class*="header-time"], [class*="time"]');
      const summaryNode = el.querySelector('.text-W2RFz4, .item-content-BSDfEh, [class*="item-content"], [class*="content"], [class*="summary"], [class*="desc"]');
      const clickTarget = el.querySelector('.item-header-name-eukBdz, .item-left-DQVRGQ, .item-pDpQ3g, .semi-list-item-body-main, .semi-list-item-body, a') || el;
      const unread = collectUnreadSignals(el);
      const selected = (typeof el.className === 'string' && el.className.includes('active-BApUO3'))
        || el.getAttribute('aria-selected') === 'true';
      const rawText = textOf(el).slice(0, 160);
      const clickText = textOf(clickTarget).slice(0, 120);
      const nickname = textOf(nicknameNode) || clickText.replace(/^\d+\s*/, '').split(/\s+/).slice(0, 1).join(' ');
      const timeText = textOf(timeNode);
      const summary = textOf(summaryNode).slice(0, 120) || rawText.replace(/^\d+\s*/, '').replace((nickname || ''), '').replace((timeText || ''), '').trim().slice(0, 120);
      const text = rawText;
      const sessionKey = [nickname, timeText, summary]
        .map(v => (v || '').trim())
        .filter(Boolean)
        .join(' | ')
        .slice(0, 240);
      const identityCandidates = collectIdentityCandidates([el, clickTarget, nicknameNode]);
      return {
        domIndex,
        sessionKey,
        nickname,
        timeText,
        summary,
        text,
        clickable: clickable(el) || clickable(clickTarget) || !!clickTarget,
        selected,
        unreadBadge: unread.unreadBadge,
        unreadDot: unread.unreadDot,
        unreadFlag: unread.unreadFlag,
        possibleUnreadFlag: unread.possibleUnreadFlag,
        unreadReason: unread.unreadReason,
        unreadSignals: unread.unreadSignals,
        rect: rectOf(el),
        hint: pathHint(el),
        clickTarget: clickTarget ? {
          tag: (clickTarget.tagName || '').toLowerCase(),
          text: textOf(clickTarget).slice(0, 80),
          rect: rectOf(clickTarget),
          hint: pathHint(clickTarget),
        } : null,
        identityCandidates,
      };
    });

    const selectedSession = sessionCandidates.find(item => item.selected) || null;
    const unreadCandidates = sessionCandidates.filter(item => item.unreadFlag);
    const activeTabText = (tabs.find(item => item && item.selected)?.text || '').trim();
    const conversationType = activeTabText === '群消息' ? 'group' : 'private';

    const messagePanel = document.querySelector('.box-container-yGo0TJ')
      || document.querySelector('.box-content-qyCVPY')?.parentElement
      || null;
    const messageContent = messagePanel?.querySelector('.box-content-qyCVPY') || null;
    const messageContentRect = messageContent ? rectOf(messageContent) : null;
    const currentHeaderName = textOf(messagePanel?.querySelector('.box-header-name-z3_MyF') || null);
    const selectedSessionName = selectedSession ? (selectedSession.nickname || '') : '';
    // 群聊中 selectedSession.nickname 更稳定代表群名；header 有时会被气泡/历史内容污染。
    const groupHeaderName = conversationType === 'group' ? (selectedSessionName || currentHeaderName || '') : '';
    const displayHeaderName = conversationType === 'group' ? groupHeaderName : currentHeaderName;
    const intersects = (rect, bounds) => {
      if (!rect || !bounds) return false;
      return rect.x < bounds.x + bounds.w
        && rect.x + rect.w > bounds.x
        && rect.y < bounds.y + bounds.h
        && rect.y + rect.h > bounds.y;
    };
    const bubbleEls = Array.from(messageContent?.querySelectorAll('.box-item-W0TV01 .box-item-message-r0L2l6') || [])
      .filter(visible);

    const parseGroupIncoming = (rawText, el, isMine) => {
      const normalized = (rawText || '').replace(/\s+/g, ' ').trim();
      if (conversationType !== 'group' || isMine || !normalized) {
        return {senderName: '', messageText: normalized, structuredText: normalized};
      }

      const cleanPrefix = (text, prefix) => {
        const t = (text || '').replace(/\s+/g, ' ').trim();
        const p = (prefix || '').replace(/\s+/g, ' ').trim();
        if (!t || !p) return t;
        return t === p ? '' : t.replace(new RegExp('^' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*'), '').trim();
      };

      const authorNode = el.querySelector('[class*="aweme-author-name"], [class*="author-name"], [class*="nickname"], [class*="nick-name"], [class*="name"]');
      const authorText = textOf(authorNode);
      const parts = normalized.split(/\s+/).filter(Boolean);
      let senderName = authorText || '';
      let messageText = normalized;

      // 抖音群消息常见文本形态："发送人 消息正文"。
      // 没有明确 author 节点时，才用第一段文本作为发送人兜底。
      if (!senderName && parts.length >= 2) {
        senderName = parts[0];
        messageText = parts.slice(1).join(' ').trim() || normalized;
      }
      if (senderName) {
        messageText = cleanPrefix(messageText, senderName) || messageText;
      }

      // 群名不应由气泡文本推断，避免把发送人误当群名。
      // 如果兜底出来的 senderName 等于群名，说明该气泡结构不可靠，保留正文但清空发送人。
      if (groupHeaderName && senderName && senderName === groupHeaderName && parts.length >= 2) {
        senderName = '';
        messageText = normalized;
      }

      const structuredText = [
        groupHeaderName ? `群名: ${groupHeaderName}` : '',
        senderName ? `发送人: ${senderName}` : '',
        `消息正文: ${messageText || normalized}`,
      ].filter(Boolean).join('\n');
      return {senderName, messageText: messageText || normalized, structuredText};
    };

    const replyBlockPhrases = ['请打开抖音app查看', '打开抖音app查看', '请在抖音app查看', '打开app查看', '新类型消息'];
    const replyBlockPhraseOf = (value) => {
      const normalized = (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!normalized) return '';
      return replyBlockPhrases.find(phrase => normalized.includes(phrase.toLowerCase())) || '';
    };

    const classifyRecordMessage = (el, rawText, explicitText) => {
      const text = (rawText || '').replace(/\s+/g, ' ').trim();
      const explicitMessageText = (explicitText || '').replace(/\s+/g, ' ').trim();
      const appOnlyPhrase = replyBlockPhraseOf(`${text} ${explicitMessageText}`);
      const classText = String(el?.className || '').toLowerCase();
      const has = (selector) => { try { return !!el?.querySelector(selector); } catch (e) { return false; } };
      const mediaNodes = Array.from(el?.querySelectorAll('img, picture, [class*="emoji"], [class*="sticker"], [class*="expression"], [class*="emoticon"]') || []).slice(0, 8);
      const mediaHint = [classText, ...mediaNodes.flatMap(node => [
        String(node?.className || ''),
        String(node?.getAttribute?.('alt') || ''),
        String(node?.getAttribute?.('title') || ''),
        String(node?.getAttribute?.('aria-label') || ''),
        String(node?.getAttribute?.('data-type') || ''),
        String(node?.getAttribute?.('src') || '').split('?')[0].slice(-180),
      ])].join(' ').toLowerCase();
      const emojiHint = has('[class*="emoji"], [class*="sticker"], [class*="expression"], [class*="emoticon"], [aria-label*="表情"], [title*="表情"]')
        || /(emoji|emoticon|sticker|expression|face[-_]?icon|表情|贴纸)/i.test(mediaHint);
      let messageType = 'text';
      let placeholder = '';
      let sourceTypeCode = 'text';
      if (has('video') || /(^|[-_\s])video([-_\s]|$)/i.test(classText)) {
        messageType = 'video'; placeholder = '[视频]'; sourceTypeCode = 'dom_video';
      } else if (has('audio') || /(^|[-_\s])(voice|audio)([-_\s]|$)/i.test(classText)) {
        messageType = 'voice'; placeholder = '[语音]'; sourceTypeCode = 'dom_voice';
      } else if (has('[download], [class*="file"], [class*="document"]')) {
        messageType = 'file'; placeholder = '[文件]'; sourceTypeCode = 'dom_file';
      } else if (emojiHint) {
        messageType = 'emoji'; placeholder = '[表情]'; sourceTypeCode = 'dom_emoji_hint';
      } else if (has('img, picture, [class*="image"], [class*="photo"]')) {
        messageType = 'image'; placeholder = '[图片]'; sourceTypeCode = 'dom_image';
      } else if (has('[class*="card"], [class*="share"], [class*="goods"], [class*="product"]')) {
        messageType = 'card'; placeholder = '[卡片]'; sourceTypeCode = 'dom_card';
      } else if (has('a[href]') || /https?:\/\//i.test(text)) {
        messageType = 'link'; placeholder = '[链接]'; sourceTypeCode = 'dom_link';
      } else if (appOnlyPhrase) {
        // The desktop creator page uses this generic sentence for message types
        // it cannot render (for example an invitation/card available only in
        // the Douyin app). It is platform UI text, not the user's chat text.
        messageType = 'unknown'; placeholder = '[其他类型消息]'; sourceTypeCode = 'dom_app_only_unknown';
      } else if (!text) {
        messageType = 'unknown'; placeholder = '[其他类型消息]'; sourceTypeCode = 'dom_unknown';
      }
      const safeExplicitMessageText = appOnlyPhrase ? '' : explicitMessageText;
      return {
        recordMessageType: messageType,
        recordText: (messageType === 'text' ? text : safeExplicitMessageText).slice(0, 20000),
        recordHasExplicitText: !!safeExplicitMessageText,
        recordPlaceholder: placeholder,
        recordSourceTypeCode: sourceTypeCode,
        recordClassificationSource: 'douyin_dom_v1',
        recordAppOnlyPlaceholder: !!appOnlyPhrase,
      };
    };

    const bubbleCandidates = bubbleEls.map((el) => {
      const row = el.closest('.box-item-W0TV01');
      const bubbleRect = rectOf(el);
      const isMine = !!(row && row.classList.contains('is-me-cb9NAa'));
      const explicitTextNode = el.querySelector('.text-prz9K6, .text-item-message-zUNhSB, pre');
      // Keep the original visible text for the existing reply state machine,
      // but only persist explicit message-body text for non-text records. This
      // prevents img alt/title, avatar labels, filenames, and accessibility
      // metadata from becoming chat text in the local database.
      const rawBubbleText = textOf(explicitTextNode || el);
      const explicitRecordText = explicitTextNode ? textOf(explicitTextNode) : '';
      const rawText = rawBubbleText.slice(0, 200);
      const groupInfo = parseGroupIncoming(rawText, el, isMine);
      const recordGroupInfo = parseGroupIncoming(explicitRecordText, el, isMine);
      const recordMeta = classifyRecordMessage(
        el,
        conversationType === 'group' && !isMine ? recordGroupInfo.messageText : rawBubbleText,
        conversationType === 'group' && !isMine ? recordGroupInfo.messageText : explicitRecordText
      );
      return {
        text: rawText.slice(0, 160),
        messageText: groupInfo.messageText.slice(0, 160),
        senderName: groupInfo.senderName.slice(0, 80),
        structuredText: groupInfo.structuredText.slice(0, 240),
        conversationType,
        activeTabText,
        side: isMine ? 'right' : 'left',
        rect: bubbleRect,
        viewportVisible: intersects(bubbleRect, messageContentRect),
        hint: pathHint(el),
        ...recordMeta,
      };
    });

    const visibleBubbleCandidates = bubbleCandidates
      .filter(item => item.viewportVisible)
      .sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x));

    const inputNode = document.querySelector('.chat-editor-X6QnIU .chat-input-nSWBco[contenteditable="true"]')
      || document.querySelector('.chat-editor-X6QnIU [contenteditable="true"]');
    const sendButtonNodes = Array.from(document.querySelectorAll('.chat-editor-X6QnIU .chat-btn, .chat-editor-X6QnIU button'))
      .filter(visible);
    const sendButtons = sendButtonNodes.map((el) => ({
      text: textOf(el),
      disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
      clickable: clickable(el),
      rect: rectOf(el),
      hint: pathHint(el),
    }));

    const inputCandidates = inputNode ? [{
      tag: (inputNode.tagName || '').toLowerCase(),
      placeholder: inputNode.getAttribute('placeholder') || '',
      editable: inputNode.getAttribute('contenteditable') || '',
      rect: rectOf(inputNode),
      hint: pathHint(inputNode),
      clickable: clickable(inputNode),
      textPreview: textOf(inputNode).slice(0, 120),
    }] : [];

    const selectedSummary = selectedSession ? (selectedSession.summary || selectedSession.text || '') : '';
    const latestIncoming = [...visibleBubbleCandidates].reverse().find(item => {
      if (item.side !== 'left' || !(item.messageText || item.text)) return false;
      if (conversationType !== 'group') return true;
      // 群消息里忽略只有发送人、没有正文的头像/名字类气泡，降低上下文串人。
      const msg = (item.messageText || item.text || '').trim();
      const sender = (item.senderName || '').trim();
      return !!msg && (!sender || msg !== sender);
    }) || null;
    const latestOutgoing = [...visibleBubbleCandidates].reverse().find(item => item.side === 'right' && item.text) || null;
    const latestIncomingMessageText = latestIncoming ? ((conversationType === 'group' ? (latestIncoming.messageText || latestIncoming.text) : latestIncoming.text) || '') : '';
    const latestIncomingStructuredText = latestIncoming ? ((conversationType === 'group' ? (latestIncoming.structuredText || latestIncomingMessageText) : latestIncoming.text) || '') : '';
    const groupName = conversationType === 'group' ? groupHeaderName : '';
    const groupSenderName = conversationType === 'group' && latestIncoming ? (latestIncoming.senderName || '') : '';
    const blockTextSources = [
      selectedSummary,
      latestIncomingMessageText,
      ...([...(visibleBubbleCandidates.filter(item => item.side === 'left'))].slice(-2).map(item => item.messageText || item.text)),
    ].filter(Boolean);
    const combinedTexts = blockTextSources.join(' | ');
    const blockPhrase = replyBlockPhrases.find(phrase => combinedTexts.includes(phrase)) || '';
    const enabledSendButtons = sendButtons.filter(item => !item.disabled);

    let replyState = 'reply_ready';
    let skipReason = '';
    if (!messagePanel) {
      replyState = 'message_panel_missing';
      skipReason = 'message_panel_missing';
    } else if (blockPhrase) {
      replyState = 'blocked_app_only';
      skipReason = blockPhrase;
    } else if (!inputCandidates.length) {
      replyState = 'input_missing';
      skipReason = 'input_missing';
    } else if (!sendButtons.length) {
      replyState = 'send_button_missing';
      skipReason = 'send_button_missing';
    } else if ((inputCandidates[0]?.editable || '').toLowerCase() !== 'true') {
      replyState = 'input_not_editable';
      skipReason = 'input_not_editable';
    }

    const replyReadiness = {
      canReply: replyState === 'reply_ready',
      state: replyState,
      skipReason: skipReason || null,
      blockPhrase: blockPhrase || null,
      hasMessagePanel: !!messagePanel,
      hasInput: inputCandidates.length > 0,
      inputEditable: ((inputCandidates[0]?.editable || '').toLowerCase() === 'true'),
      hasSendButton: sendButtons.length > 0,
      sendButtonEnabledNow: enabledSendButtons.length > 0,
      selectedSessionKey: selectedSession ? selectedSession.sessionKey : null,
      selectedNickname: selectedSession ? (selectedSession.nickname || '') : '',
      headerName: displayHeaderName,
      selectedSummary: selectedSummary.slice(0, 160),
      latestIncomingText: latestIncomingMessageText,
      latestIncomingStructuredText,
      latestOutgoingText: latestOutgoing ? latestOutgoing.text : '',
      currentInputText: textOf(inputNode).slice(0, 160),
      conversationType,
      activeTabText,
      groupName,
      groupSenderName,
      groupMessageText: conversationType === 'group' ? latestIncomingMessageText : '',
    };

    const identityDiagnostic = {
      version: 1,
      selectedPresent: !!selectedSession,
      selectedNicknamePresent: !!(selectedSession && selectedSession.nickname),
      headerPresent: !!displayHeaderName,
      activeTabText,
      selectedNicknameHash: diagnosticHash(selectedSession ? selectedSession.nickname : ''),
      headerHash: diagnosticHash(displayHeaderName),
      selectedSessionKeyHash: diagnosticHash(selectedSession ? selectedSession.sessionKey : ''),
      selectedHintHash: diagnosticHash(selectedSession ? selectedSession.hint : ''),
      selectedIdentityCandidates: selectedSession ? (selectedSession.identityCandidates || []) : [],
      panelIdentityCandidates: collectIdentityCandidates([
        messagePanel,
        messagePanel?.querySelector('.box-header-name-z3_MyF') || null,
      ]),
    };

    const conversationContext = {
      headerName: replyReadiness.headerName,
      latestIncoming: latestIncoming,
      latestOutgoing: latestOutgoing,
      visibleBubbleSamples: visibleBubbleCandidates.slice(-6),
      selectedSummary: selectedSummary.slice(0, 160),
      currentInputText: textOf(inputNode).slice(0, 160),
      conversationType,
      activeTabText,
      groupName,
      groupSenderName,
      groupMessageText: conversationType === 'group' ? latestIncomingMessageText : '',
      latestIncomingStructuredText,
    };

    return serialize({
      ok: true,
      module: 'dm',
      url: location.href,
      title: document.title || '',
      tabs,
      leftPanel: leftPanel ? {
        found: true,
        rect: rectOf(leftPanel),
        hint: pathHint(leftPanel),
        sessionCountInside: sessionEls.length,
        scroll: listScroller ? {
          top: Math.round(listScroller.scrollTop || 0),
          clientHeight: Math.round(listScroller.clientHeight || 0),
          scrollHeight: Math.round(listScroller.scrollHeight || 0),
          maxTop: Math.max(0, Math.round((listScroller.scrollHeight || 0) - (listScroller.clientHeight || 0))),
          atTop: (listScroller.scrollTop || 0) <= 2,
          atBottom: (listScroller.scrollTop || 0) >= Math.max(0, (listScroller.scrollHeight || 0) - (listScroller.clientHeight || 0) - 2),
        } : null,
      } : {found: false},
      messagePanel: messagePanel ? {
        found: true,
        rect: rectOf(messagePanel),
        contentRect: messageContentRect,
        hint: pathHint(messagePanel),
        headerName: textOf(messagePanel.querySelector('.box-header-name-z3_MyF')),
        bubbleLikeCount: bubbleEls.length,
        visibleBubbleLikeCount: visibleBubbleCandidates.length,
        scroll: messageContent ? {
          top: Math.round(messageContent.scrollTop || 0),
          clientHeight: Math.round(messageContent.clientHeight || 0),
          scrollHeight: Math.round(messageContent.scrollHeight || 0),
          atTop: (messageContent.scrollTop || 0) <= 2,
          atBottom: (messageContent.scrollTop || 0) >= Math.max(0, (messageContent.scrollHeight || 0) - (messageContent.clientHeight || 0) - 2),
        } : null,
      } : {found: false},
      sessionCandidates: uniqBy(sessionCandidates, item => [item.nickname, item.summary, item.rect.y].join('|')).slice(0, 12),
      selectedSession,
      unreadCandidates: unreadCandidates.slice(0, 8),
      possibleUnreadCandidates: sessionCandidates.filter(item => item.possibleUnreadFlag && !item.unreadFlag).slice(0, 6),
      inputCandidates,
      sendButtons,
      bubbleCandidates: uniqBy(bubbleCandidates, item => [item.text, item.side, item.rect.y].join('|')).slice(0, 16),
      visibleBubbleCandidates: uniqBy(visibleBubbleCandidates, item => [item.text, item.side, item.rect.y].join('|')).slice(-8),
      replyReadiness,
      conversationContext,
      identityDiagnostic,
      counts: {
        sessionCandidates: sessionCandidates.length,
        unreadCandidates: unreadCandidates.length,
        possibleUnreadCandidates: sessionCandidates.filter(item => item.possibleUnreadFlag && !item.unreadFlag).length,
        inputCandidates: inputCandidates.length,
        sendButtons: sendButtons.length,
        bubbleCandidates: bubbleCandidates.length,
        visibleBubbleCandidates: visibleBubbleCandidates.length,
      },
      debug: {
        activePane: activePane ? {rect: rectOf(activePane), hint: pathHint(activePane)} : null,
        tabCount: tabs.length,
      },
    });
  } catch (err) {
    return JSON.stringify({ok: false, module: 'dm', error: String(err), url: location.href});
  }
})();
"""





def build_dm_switch_sub_tab_script(target_text: str) -> str:
    """Click one of the in-chat DM sub tabs: 朋友私信 / 陌生人私信 / 群消息."""
    return f"""
(() => {{
  try {{
    const targetText = {json.dumps(target_text)};
    const textOf = (el) => (((el && (el.innerText || el.textContent)) || '') + '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {{
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.02 && rect.width >= 2 && rect.height >= 2;
    }};
    const rectOf = (el) => {{
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {{x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}};
    }};
    const activePane = document.querySelector('.chat-content.semi-tabs-pane-active[aria-hidden="false"]')
      || document.querySelector('.chat-content.semi-tabs-pane-active')
      || document.querySelector('.container-_r15W6.chat-container-heHrxU')
      || document;
    const nodes = Array.from(activePane.querySelectorAll('.sub-tab-item-LMD8co, [role="tab"], .semi-tabs-tab'))
      .filter(visible);
    const before = nodes
      .map((node) => ({{text: textOf(node), active: (typeof node.className === 'string' && node.className.includes('active-BApUO3')) || node.getAttribute('aria-selected') === 'true', rect: rectOf(node)}}))
      .filter(item => item.text);
    const target = nodes.find((node) => textOf(node) === targetText || textOf(node).includes(targetText));
    if (!target) {{
      return JSON.stringify({{ok: false, state: 'tab_not_found', targetText, before}});
    }}
    target.scrollIntoView({{block: 'center', inline: 'center'}});
    const opts = {{bubbles: true, cancelable: true, view: window}};
    try {{ target.dispatchEvent(new MouseEvent('mouseenter', opts)); }} catch (e) {{}}
    try {{ target.dispatchEvent(new MouseEvent('mouseover', opts)); }} catch (e) {{}}
    try {{ target.dispatchEvent(new MouseEvent('mousedown', opts)); }} catch (e) {{}}
    try {{ target.dispatchEvent(new MouseEvent('mouseup', opts)); }} catch (e) {{}}
    try {{ target.click(); }} catch (e) {{}}
    try {{ target.dispatchEvent(new MouseEvent('click', opts)); }} catch (e) {{}}
    return JSON.stringify({{
      ok: true,
      state: 'clicked',
      targetText,
      clickedText: textOf(target),
      targetRect: rectOf(target),
      before,
    }});
  }} catch (err) {{
    return JSON.stringify({{ok: false, state: 'js_error', targetText: {json.dumps(target_text)}, error: String(err)}});
  }}
}})();
"""

def build_dm_scroll_list_script(direction: str = "down", step_ratio: float = 0.82) -> str:
    if direction not in {"down", "up", "top", "bottom"}:
        direction = "down"
    return f"""
(() => {{
  try {{
    const direction = {json.dumps(direction)};
    const stepRatio = Math.max(0.25, Math.min(1.5, Number({step_ratio})));
    const activePane = document.querySelector('.chat-content.semi-tabs-pane-active[aria-hidden="false"]')
      || document.querySelector('.chat-content.semi-tabs-pane-active')
      || document.querySelector('.container-_r15W6.chat-container-heHrxU')
      || document;
    const leftPanel = activePane.querySelector('.list-zrsZ82')
      || activePane.querySelector('.semi-list')
      || activePane.querySelector('.ReactVirtualized__List')
      || null;
    const scroller = leftPanel?.querySelector('.ReactVirtualized__Grid.ReactVirtualized__List, .ReactVirtualized__Grid')
      || activePane.querySelector('.list-zrsZ82 .ReactVirtualized__Grid.ReactVirtualized__List, .list-zrsZ82 .ReactVirtualized__Grid')
      || null;
    if (!scroller) {{
      return JSON.stringify({{ok: false, reason: 'scroller_not_found'}});
    }}
    const before = Math.round(scroller.scrollTop || 0);
    const clientHeight = Math.round(scroller.clientHeight || 0);
    const scrollHeight = Math.round(scroller.scrollHeight || 0);
    const maxTop = Math.max(0, scrollHeight - clientHeight);
    const step = Math.max(160, Math.round(clientHeight * stepRatio));
    let targetTop = before;
    if (direction === 'down') targetTop = Math.min(maxTop, before + step);
    else if (direction === 'up') targetTop = Math.max(0, before - step);
    else if (direction === 'top') targetTop = 0;
    else if (direction === 'bottom') targetTop = maxTop;
    scroller.scrollTop = targetTop;
    try {{ scroller.dispatchEvent(new Event('scroll', {{bubbles: true}})); }} catch (e) {{}}
    const after = Math.round(scroller.scrollTop || 0);
    return JSON.stringify({{
      ok: true,
      direction,
      changed: after !== before,
      before,
      after,
      clientHeight,
      scrollHeight,
      maxTop,
      atTop: after <= 2,
      atBottom: after >= Math.max(0, maxTop - 2),
    }});
  }} catch (err) {{
    return JSON.stringify({{ok: false, reason: 'js_error', error: String(err)}});
  }}
}})();
"""


def build_dm_open_session_by_key_script(candidate: dict) -> str:
    """Open a DM session by re-locating the current DOM item from a stable fingerprint.

    The creator-center session list is virtualized. Reusing a stale domIndex can click
    the wrong row after the list re-renders. This script refuses to click unless the
    current item matches the expected nickname/summary/sessionKey.
    """
    return f"""
(() => {{
  try {{
    const expected = {json.dumps(candidate, ensure_ascii=False)};
    const normalize = (value) => (((value || '') + '').replace(/\\s+/g, ' ').trim());
    const compact = (value) => normalize(value).replace(/\\s+/g, '').toLowerCase();
    const expectedIndex = Number.isInteger(expected.domIndex) ? expected.domIndex : -1;
    const expectedKey = normalize(expected.sessionKey || '');
    const expectedNick = normalize(expected.nickname || '');
    const expectedSummary = normalize(expected.summary || '');
    const expectedText = normalize(expected.text || '');

    const activePane = document.querySelector('.chat-content.semi-tabs-pane-active[aria-hidden="false"]')
      || document.querySelector('.chat-content.semi-tabs-pane-active')
      || document.querySelector('.container-_r15W6.chat-container-heHrxU')
      || document;
    const items = Array.from(activePane.querySelectorAll('li[role="list-item"].semi-list-item'));

    const itemInfo = (item, index) => {{
      const text = normalize((item.innerText || item.textContent) || '');
      const nameNode = item.querySelector('.item-header-name-eukBdz');
      const timeNode = item.querySelector('.item-header-time-zYto72, .item-header-time, [class*="time"]');
      const summaryNode = item.querySelector('.item-content-h0tLij, .item-message, .item-desc, [class*="content"], [class*="summary"]');
      const nickname = normalize((nameNode && (nameNode.innerText || nameNode.textContent)) || '');
      const timeText = normalize((timeNode && (timeNode.innerText || timeNode.textContent)) || '');
      let summary = normalize((summaryNode && (summaryNode.innerText || summaryNode.textContent)) || '');
      if (!summary && nickname && text.includes(nickname)) {{
        summary = normalize(text.replace(nickname, '').replace(timeText, ''));
      }}
      const sessionKey = [nickname, timeText, summary].filter(Boolean).join(' | ').slice(0, 180);
      return {{
        index,
        item,
        text,
        nickname,
        timeText,
        summary,
        sessionKey,
        compactText: compact(text),
        compactKey: compact(sessionKey),
        compactNick: compact(nickname),
        compactSummary: compact(summary),
      }};
    }};

    const expectedCompactKey = compact(expectedKey);
    const expectedCompactNick = compact(expectedNick);
    const expectedCompactSummary = compact(expectedSummary);
    const expectedCompactText = compact(expectedText);
    const infos = items.map(itemInfo);

    const isMatch = (info) => {{
      if (!info) return false;
      if (expectedCompactKey && info.compactKey === expectedCompactKey) return true;
      const nickOk = expectedCompactNick && (info.compactNick === expectedCompactNick || info.compactText.includes(expectedCompactNick));
      const summaryOk = expectedCompactSummary && (info.compactSummary.includes(expectedCompactSummary) || info.compactText.includes(expectedCompactSummary));
      if (nickOk && summaryOk) return true;
      if (expectedCompactText && info.compactText === expectedCompactText) return true;
      return false;
    }};

    let info = null;
    if (expectedIndex >= 0 && expectedIndex < infos.length && isMatch(infos[expectedIndex])) {{
      info = infos[expectedIndex];
    }}
    if (!info) {{
      info = infos.find(isMatch) || null;
    }}
    if (!info) {{
      return JSON.stringify({{
        clicked: false,
        reason: 'session_fingerprint_not_found',
        expected: {{
          domIndex: expectedIndex,
          sessionKey: expectedKey,
          nickname: expectedNick,
          summary: expectedSummary,
        }},
        total: items.length,
        visibleSamples: infos.slice(0, 6).map(x => ({{
          domIndex: x.index,
          sessionKey: x.sessionKey,
          nickname: x.nickname,
          summary: x.summary,
          text: x.text.slice(0, 160),
        }})),
      }});
    }}

    const item = info.item;
    const candidates = [
      item.querySelector('.item-header-name-eukBdz'),
      item.querySelector('.item-left-DQVRGQ'),
      item.querySelector('.item-pDpQ3g'),
      item.querySelector('.semi-list-item-body-main'),
      item.querySelector('.semi-list-item-body'),
      item.querySelector('a'),
      item,
    ].filter(Boolean);

    const fire = (node) => {{
      const rect = node.getBoundingClientRect();
      node.scrollIntoView({{block: 'center', inline: 'nearest'}});
      const opts = {{bubbles: true, cancelable: true, view: window}};
      try {{ node.dispatchEvent(new MouseEvent('mouseenter', opts)); }} catch (e) {{}}
      try {{ node.dispatchEvent(new MouseEvent('mouseover', opts)); }} catch (e) {{}}
      try {{ node.dispatchEvent(new MouseEvent('mousedown', opts)); }} catch (e) {{}}
      try {{ node.dispatchEvent(new MouseEvent('mouseup', opts)); }} catch (e) {{}}
      try {{ node.click(); }} catch (e) {{}}
      try {{ node.dispatchEvent(new MouseEvent('click', opts)); }} catch (e) {{}}
      return {{
        tag: (node.tagName || '').toLowerCase(),
        className: typeof node.className === 'string' ? node.className : '',
        text: normalize((node.innerText || node.textContent) || '').slice(0, 80),
        rect: {{x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height)}},
      }};
    }};

    const attempts = candidates.map(fire);
    return JSON.stringify({{
      clicked: true,
      domIndex: info.index,
      matchedByFingerprint: true,
      expected: {{
        domIndex: expectedIndex,
        sessionKey: expectedKey,
        nickname: expectedNick,
        summary: expectedSummary,
      }},
      actual: {{
        domIndex: info.index,
        sessionKey: info.sessionKey,
        nickname: info.nickname,
        summary: info.summary,
        text: info.text.slice(0, 160),
      }},
      attempts,
      itemText: info.text.slice(0, 160),
      itemClass: typeof item.className === 'string' ? item.className : '',
    }});
  }} catch (err) {{
    return JSON.stringify({{clicked: false, reason: 'js_error', error: String(err), expected: {json.dumps(candidate, ensure_ascii=False)}}});
  }}
}})();
"""

def build_dm_open_session_script(dom_index: int) -> str:
    return f"""
(() => {{
  try {{
    const index = {dom_index};
    const activePane = document.querySelector('.chat-content.semi-tabs-pane-active[aria-hidden="false"]')
      || document.querySelector('.chat-content.semi-tabs-pane-active')
      || document.querySelector('.container-_r15W6.chat-container-heHrxU')
      || document;
    const items = Array.from(activePane.querySelectorAll('li[role="list-item"].semi-list-item'));
    const item = items[index];
    if (!item) {{
      return JSON.stringify({{clicked: false, reason: 'item_not_found', domIndex: index, total: items.length}});
    }}
    const candidates = [
      item.querySelector('.item-header-name-eukBdz'),
      item.querySelector('.item-left-DQVRGQ'),
      item.querySelector('.item-pDpQ3g'),
      item.querySelector('.semi-list-item-body-main'),
      item.querySelector('.semi-list-item-body'),
      item.querySelector('a'),
      item,
    ].filter(Boolean);

    const fire = (node) => {{
      const rect = node.getBoundingClientRect();
      node.scrollIntoView({{block: 'center', inline: 'nearest'}});
      const opts = {{bubbles: true, cancelable: true, view: window}};
      try {{ node.dispatchEvent(new MouseEvent('mouseenter', opts)); }} catch (e) {{}}
      try {{ node.dispatchEvent(new MouseEvent('mouseover', opts)); }} catch (e) {{}}
      try {{ node.dispatchEvent(new MouseEvent('mousedown', opts)); }} catch (e) {{}}
      try {{ node.dispatchEvent(new MouseEvent('mouseup', opts)); }} catch (e) {{}}
      try {{ node.click(); }} catch (e) {{}}
      try {{ node.dispatchEvent(new MouseEvent('click', opts)); }} catch (e) {{}}
      return {{
        tag: (node.tagName || '').toLowerCase(),
        className: typeof node.className === 'string' ? node.className : '',
        text: ((node.innerText || node.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        rect: {{x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height)}},
      }};
    }};

    const attempts = candidates.map(fire);
    return JSON.stringify({{
      clicked: true,
      domIndex: index,
      attempts,
      itemText: ((item.innerText || item.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      itemClass: typeof item.className === 'string' ? item.className : '',
    }});
  }} catch (err) {{
    return JSON.stringify({{clicked: false, reason: 'js_error', error: String(err), domIndex: {dom_index}}});
  }}
}})();
"""





def build_dm_stage_reply_script(reply_text: str) -> str:
    return f"""
(() => {{
  try {{
    const replyText = {json.dumps(reply_text)};
    const textOf = (el) => (((el && (el.innerText || el.textContent)) || '') + '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {{
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.02 && rect.width >= 2 && rect.height >= 2;
    }};
    const inputNode = document.querySelector('.chat-editor-X6QnIU .chat-input-nSWBco[contenteditable="true"]')
      || document.querySelector('.chat-editor-X6QnIU [contenteditable="true"]');
    const sendButton = Array.from(document.querySelectorAll('.chat-editor-X6QnIU .chat-btn, .chat-editor-X6QnIU button'))
      .filter(visible)[0] || null;
    const headerNode = document.querySelector('.box-header-name-z3_MyF');
    if (!inputNode) {{
      return JSON.stringify({{ok: false, state: 'input_missing', headerName: textOf(headerNode)}});
    }}
    if (!sendButton) {{
      return JSON.stringify({{ok: false, state: 'send_button_missing', headerName: textOf(headerNode)}});
    }}
    const editable = String(inputNode.getAttribute('contenteditable') || '').toLowerCase() === 'true';
    if (!editable) {{
      return JSON.stringify({{ok: false, state: 'input_not_editable', headerName: textOf(headerNode)}});
    }}
    const getDisabled = () => !!sendButton.disabled || sendButton.getAttribute('aria-disabled') === 'true' || sendButton.classList.contains('semi-button-disabled');
    const existingDraft = textOf(inputNode);
    if (existingDraft) {{
      return JSON.stringify({{
        ok: true,
        state: 'skipped_existing_draft',
        headerName: textOf(headerNode),
        draftPreview: existingDraft.slice(0, 120),
        afterDisabled: getDisabled(),
      }});
    }}
    const fireInputEvents = (data, inputType) => {{
      try {{ inputNode.dispatchEvent(new InputEvent('beforeinput', {{bubbles: true, data, inputType}})); }} catch (e) {{}}
      try {{ inputNode.dispatchEvent(new InputEvent('input', {{bubbles: true, data, inputType}})); }} catch (e) {{
        try {{ inputNode.dispatchEvent(new Event('input', {{bubbles: true}})); }} catch (e2) {{}}
      }}
      try {{ inputNode.dispatchEvent(new Event('change', {{bubbles: true}})); }} catch (e) {{}}
      try {{ inputNode.dispatchEvent(new KeyboardEvent('keyup', {{bubbles: true, key: 'Enter'}})); }} catch (e) {{}}
    }};
    inputNode.focus();
    try {{
      const selection = window.getSelection();
      if (selection) {{
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(inputNode);
        range.collapse(true);
        selection.addRange(range);
      }}
    }} catch (e) {{}}
    inputNode.innerHTML = '';
    inputNode.textContent = replyText;
    try {{
      const selection = window.getSelection();
      if (selection) {{
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(inputNode);
        range.collapse(false);
        selection.addRange(range);
      }}
    }} catch (e) {{}}
    fireInputEvents(replyText, 'insertText');
    return JSON.stringify({{
      ok: true,
      state: 'draft_staged',
      headerName: textOf(headerNode),
      draftPreview: textOf(inputNode).slice(0, 120),
      afterDisabled: getDisabled(),
      inputLength: textOf(inputNode).length,
    }});
  }} catch (err) {{
    return JSON.stringify({{ok: false, state: 'js_error', error: String(err)}});
  }}
}})();
"""

def build_dm_reply_precheck_script(probe_text: str = "测") -> str:
    return f"""
(() => {{
  try {{
    const probeText = {json.dumps(probe_text)};
    const textOf = (el) => (((el && (el.innerText || el.textContent)) || '') + '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {{
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.02 && rect.width >= 2 && rect.height >= 2;
    }};
    const inputNode = document.querySelector('.chat-editor-X6QnIU .chat-input-nSWBco[contenteditable="true"]')
      || document.querySelector('.chat-editor-X6QnIU [contenteditable="true"]');
    const sendButton = Array.from(document.querySelectorAll('.chat-editor-X6QnIU .chat-btn, .chat-editor-X6QnIU button'))
      .filter(visible)[0] || null;
    const headerNode = document.querySelector('.box-header-name-z3_MyF');
    if (!inputNode) {{
      return JSON.stringify({{ok: false, state: 'input_missing', headerName: textOf(headerNode)}});
    }}
    const editable = String(inputNode.getAttribute('contenteditable') || '').toLowerCase() === 'true';
    if (!editable) {{
      return JSON.stringify({{ok: false, state: 'input_not_editable', headerName: textOf(headerNode)}});
    }}
    if (!sendButton) {{
      return JSON.stringify({{ok: false, state: 'send_button_missing', headerName: textOf(headerNode)}});
    }}
    const getDisabled = () => !!sendButton.disabled || sendButton.getAttribute('aria-disabled') === 'true' || sendButton.classList.contains('semi-button-disabled');
    const originalText = textOf(inputNode);
    const originalHtml = inputNode.innerHTML;
    const hadExistingDraft = originalText.length > 0;
    const beforeDisabled = getDisabled();
    if (hadExistingDraft) {{
      return JSON.stringify({{
        ok: true,
        state: 'skipped_existing_draft',
        headerName: textOf(headerNode),
        beforeDisabled,
        afterDisabled: beforeDisabled,
        activatedDuringProbe: !beforeDisabled,
        existingDraftPreview: originalText.slice(0, 80),
      }});
    }}
    inputNode.focus();
    inputNode.innerHTML = '';
    inputNode.textContent = probeText;
    try {{ inputNode.dispatchEvent(new InputEvent('input', {{bubbles: true, data: probeText, inputType: 'insertText'}})); }} catch (e) {{
      try {{ inputNode.dispatchEvent(new Event('input', {{bubbles: true}})); }} catch (e2) {{}}
    }}
    try {{ inputNode.dispatchEvent(new Event('change', {{bubbles: true}})); }} catch (e) {{}}
    const afterDisabled = getDisabled();
    inputNode.innerHTML = originalHtml;
    try {{ inputNode.dispatchEvent(new InputEvent('input', {{bubbles: true, data: '', inputType: 'deleteContentBackward'}})); }} catch (e) {{
      try {{ inputNode.dispatchEvent(new Event('input', {{bubbles: true}})); }} catch (e2) {{}}
    }}
    try {{ inputNode.dispatchEvent(new Event('change', {{bubbles: true}})); }} catch (e) {{}}
    return JSON.stringify({{
      ok: true,
      state: 'probe_complete',
      headerName: textOf(headerNode),
      beforeDisabled,
      afterDisabled,
      activatedDuringProbe: beforeDisabled && !afterDisabled,
      restoredEmpty: textOf(inputNode) === '',
      existingDraftPreview: '',
    }});
  }} catch (err) {{
    return JSON.stringify({{ok: false, state: 'js_error', error: String(err)}});
  }}
}})();
"""




def build_dm_send_reply_script(expected_text: str) -> str:
    return f"""
(() => {{
  try {{
    const expectedText = {json.dumps(expected_text)};
    const textOf = (el) => (((el && (el.innerText || el.textContent)) || '') + '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {{
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.02 && rect.width >= 2 && rect.height >= 2;
    }};
    const inputNode = document.querySelector('.chat-editor-X6QnIU .chat-input-nSWBco[contenteditable="true"]')
      || document.querySelector('.chat-editor-X6QnIU [contenteditable="true"]');
    const sendButton = Array.from(document.querySelectorAll('.chat-editor-X6QnIU .chat-btn, .chat-editor-X6QnIU button'))
      .filter(visible)[0] || null;
    const headerNode = document.querySelector('.box-header-name-z3_MyF');
    if (!inputNode) {{
      return JSON.stringify({{ok: false, state: 'input_missing', headerName: textOf(headerNode)}});
    }}
    if (!sendButton) {{
      return JSON.stringify({{ok: false, state: 'send_button_missing', headerName: textOf(headerNode)}});
    }}
    const getDisabled = () => !!sendButton.disabled || sendButton.getAttribute('aria-disabled') === 'true' || sendButton.classList.contains('semi-button-disabled');
    const beforeInputText = textOf(inputNode);
    const beforeDisabled = getDisabled();
    if (!beforeInputText) {{
      return JSON.stringify({{ok: false, state: 'input_empty', headerName: textOf(headerNode), beforeDisabled}});
    }}
    if (expectedText && beforeInputText !== expectedText) {{
      return JSON.stringify({{
        ok: false,
        state: 'draft_mismatch',
        headerName: textOf(headerNode),
        beforeDisabled,
        beforeInputPreview: beforeInputText.slice(0, 120),
        expectedPreview: expectedText.slice(0, 120),
      }});
    }}
    if (beforeDisabled) {{
      return JSON.stringify({{
        ok: false,
        state: 'send_button_disabled',
        headerName: textOf(headerNode),
        beforeDisabled,
        beforeInputPreview: beforeInputText.slice(0, 120),
      }});
    }}
    const fireMouse = (type) => {{
      try {{ sendButton.dispatchEvent(new MouseEvent(type, {{bubbles: true, cancelable: true, view: window}})); }} catch (e) {{}}
    }};
    sendButton.focus();
    fireMouse('mouseenter');
    fireMouse('mouseover');
    fireMouse('mousedown');
    fireMouse('mouseup');
    fireMouse('click');
    try {{ sendButton.click(); }} catch (e) {{}}
    return JSON.stringify({{
      ok: true,
      state: 'send_clicked',
      headerName: textOf(headerNode),
      beforeDisabled,
      afterDisabled: getDisabled(),
      beforeInputPreview: beforeInputText.slice(0, 120),
      afterInputPreview: textOf(inputNode).slice(0, 120),
    }});
  }} catch (err) {{
    return JSON.stringify({{ok: false, state: 'js_error', error: String(err)}});
  }}
}})();
"""

def build_comment_inspect_script() -> str:
    return r"""
(() => {
  try {
    const serialize = (value) => {
      try {
        return JSON.stringify(value);
      } catch (err) {
        return JSON.stringify({ok: false, module: 'comment', error: 'serialize_error: ' + String(err), url: location.href});
      }
    };
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.02 && rect.width >= 2 && rect.height >= 2;
    };
    const rectOf = (el) => {
      const r = el.getBoundingClientRect();
      return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)};
    };
    const pathHint = (el) => {
      if (!el || !(el instanceof Element)) return '';
      const parts = [];
      let cur = el;
      for (let i = 0; i < 5 && cur; i += 1) {
        let part = (cur.tagName || '').toLowerCase();
        if (!part) break;
        if (cur.id) part += '#' + cur.id;
        const cls = (typeof cur.className === 'string' ? cur.className : '')
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 3);
        if (cls.length) part += '.' + cls.join('.');
        parts.push(part);
        cur = cur.parentElement;
      }
      return parts.join(' <- ');
    };
    const uniqBy = (items, keyFn) => {
      const map = new Map();
      items.forEach((item) => {
        const key = keyFn(item);
        if (!map.has(key)) map.set(key, item);
      });
      return Array.from(map.values());
    };
    const clickable = (el) => {
      if (!el || !(el instanceof Element)) return false;
      const tag = (el.tagName || '').toLowerCase();
      const role = el.getAttribute('role') || '';
      const style = window.getComputedStyle(el);
      return ['a', 'button', 'input', 'textarea'].includes(tag)
        || role === 'button'
        || role === 'link'
        || el.tabIndex >= 0
        || style.cursor === 'pointer';
    };

    const root = document.querySelector('.container-AFENbv');
    const draftComposer = document.querySelector('.input-d24X73[contenteditable="true"]') || document.querySelector('.input-d24X73');
    const draftSendButton = document.querySelector('.footer-oZJTJd button');

    const commentCards = Array.from(document.querySelectorAll('.container-sXKyMs')).filter(visible);
    const replyButtonsRaw = Array.from(document.querySelectorAll('.operations-WFV7Am .item-M3fSkJ'))
      .filter(visible)
      .filter(el => textOf(el).includes('回复'));

    const cards = commentCards.map((card) => {
      const authorNode = card.querySelector('.username-aLgaNB');
      const timeNode = card.querySelector('.time-NRtTXO');
      const contentNode = card.querySelector('.comment-content-text-JvmAKq');
      const opsNode = card.querySelector('.operations-WFV7Am');
      const replyBtn = Array.from(opsNode?.querySelectorAll('.item-M3fSkJ') || []).find(el => textOf(el).includes('回复')) || null;
      const actionTexts = Array.from(opsNode?.querySelectorAll('.item-M3fSkJ') || [])
        .filter(visible)
        .map(el => textOf(el))
        .filter(Boolean);
      const replyList = card.querySelector('.reply-list-QwXCb_');
      const loadMore = card.querySelector('.reply-list-QwXCb_ .load-more-pDyh1o');
      return {
        author: textOf(authorNode),
        timeText: textOf(timeNode),
        content: textOf(contentNode).slice(0, 200),
        rect: rectOf(card),
        hint: pathHint(card),
        replyButtonFound: !!replyBtn,
        replyButtonClickable: !!replyBtn && clickable(replyBtn),
        replyButtonHint: replyBtn ? pathHint(replyBtn) : '',
        actionTexts: uniqBy(actionTexts, v => v),
        replyExpanded: !!replyList,
        nestedReplyCount: replyList ? replyList.querySelectorAll('.container-sXKyMs').length : 0,
        loadMoreText: textOf(loadMore),
      };
    });

    const replyButtons = replyButtonsRaw.map((el) => ({
      text: textOf(el),
      clickable: clickable(el),
      rect: rectOf(el),
      hint: pathHint(el),
    }));

    const listContainer = commentCards.length
      ? (commentCards[0].parentElement?.parentElement?.parentElement || commentCards[0].parentElement || null)
      : (document.querySelector('.container-Pr4RHc') || null);

    const composerCandidates = [];
    if (draftComposer && visible(draftComposer)) {
      composerCandidates.push({
        kind: 'top_comment_input',
        tag: (draftComposer.tagName || '').toLowerCase(),
        placeholder: draftComposer.getAttribute('placeholder') || draftComposer.getAttribute('aria-placeholder') || '',
        editable: draftComposer.getAttribute('contenteditable') || '',
        rect: rectOf(draftComposer),
        hint: pathHint(draftComposer),
      });
    }

    Array.from(document.querySelectorAll('.reply-NYBpwz .textarea-NCe55j, .reply-NYBpwz textarea, .reply-NYBpwz [contenteditable="true"], textarea, [contenteditable="true"]'))
      .filter(visible)
      .forEach((el) => {
        const item = {
          kind: el.closest('.reply-NYBpwz') ? 'reply_editor' : 'generic_editor',
          tag: (el.tagName || '').toLowerCase(),
          placeholder: el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || '',
          editable: el.getAttribute('contenteditable') || '',
          rect: rectOf(el),
          hint: pathHint(el),
        };
        composerCandidates.push(item);
      });

    const actionButtons = Array.from(document.querySelectorAll('button, [role="button"], .item-M3fSkJ, .load-more-pDyh1o'))
      .filter(visible)
      .map((el) => ({
        text: textOf(el),
        clickable: clickable(el),
        rect: rectOf(el),
        hint: pathHint(el),
      }))
      .filter(item => item.text && ['回复', '删除', '举报', '发送', '取消', '收起'].some(key => item.text.includes(key)) || /^查看\d+条回复$/.test(item.text));

    const composerVisible = actionButtons.some(item => item.text.includes('发送'))
      && (composerCandidates.some(item => item.kind === 'reply_editor') || actionButtons.some(item => item.text.includes('取消')));

    return serialize({
      ok: true,
      module: 'comment',
      url: location.href,
      title: document.title || '',
      header: root ? {
        found: true,
        title: textOf(root.querySelector('.title-V3HpNi')),
        postTitle: textOf(root.querySelector('.content-T9PTck .title-iqC0Gj')),
        postMeta: textOf(root.querySelector('.content-T9PTck .desc-uISkyj')),
      } : {found: false},
      listContainer: listContainer ? {
        found: true,
        rect: rectOf(listContainer),
        hint: pathHint(listContainer),
        cardCountInside: commentCards.length,
      } : {found: false},
      topComposer: draftComposer ? {
        found: true,
        rect: rectOf(draftComposer),
        hint: pathHint(draftComposer),
        placeholder: draftComposer.getAttribute('placeholder') || draftComposer.getAttribute('aria-placeholder') || '',
        sendButtonText: textOf(draftSendButton),
      } : {found: false},
      replyButtons: replyButtons.slice(0, 12),
      cards: uniqBy(cards, item => [item.author, item.content, item.rect.y].join('|')).slice(0, 16),
      composerVisible,
      composerCandidates: uniqBy(composerCandidates, item => [item.kind, item.hint, item.rect.y].join('|')).slice(0, 12),
      actionButtons: uniqBy(actionButtons, item => [item.text, item.hint, item.rect.y].join('|')).slice(0, 20),
      counts: {
        replyButtons: replyButtons.length,
        cards: cards.length,
        composerCandidates: composerCandidates.length,
      },
      debug: {
        root: root ? {rect: rectOf(root), hint: pathHint(root)} : null,
        expandedReplyListCount: document.querySelectorAll('.reply-list-QwXCb_').length,
      },
    });
  } catch (err) {
    return JSON.stringify({ok: false, module: 'comment', error: String(err), url: location.href});
  }
})();
"""


def build_click_text_script(text: str) -> str:
    safe = json.dumps(text, ensure_ascii=False)
    return f"""
(() => {{
  try {{
    const target = {safe};
    const nodes = Array.from(document.querySelectorAll('button, [role="button"], span, a, div'));
    for (const node of nodes) {{
      const txt = (node.innerText || '').replace(/\s+/g, ' ').trim();
      if (txt === target) {{
        node.scrollIntoView({{block: 'center'}});
        try {{ node.click(); }} catch (e) {{}}
        return {{clicked: true, text: txt, hint: node.className || ''}};
      }}
    }}
    return {{clicked: false, text: target}};
  }} catch (err) {{
    return {{clicked: false, text: {safe}, error: String(err)}};
  }}
}})();
"""


def build_geometry_probe_script(module: str) -> str:
    return f"""
(() => {{
  try {{
    const serialize = (value) => {{
      try {{
        return JSON.stringify(value);
      }} catch (err) {{
        return JSON.stringify({{ok: false, geometryReady: false, error: 'serialize_error: ' + String(err)}});
      }}
    }};
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const rectOf = (el) => {{
      if (!el || !(el instanceof Element)) return {{x: 0, y: 0, w: 0, h: 0}};
      const r = el.getBoundingClientRect();
      return {{x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}};
    }};
    const activePane = document.querySelector('.chat-content.semi-tabs-pane-active[aria-hidden="false"]')
      || document.querySelector('.chat-content.semi-tabs-pane-active')
      || document.querySelector('.container-_r15W6.chat-container-heHrxU')
      || document.querySelector('#sub-app')
      || document.body;

    const leftPanel = activePane?.querySelector('.list-zrsZ82')
      || activePane?.querySelector('.semi-list')
      || activePane?.querySelector('.ReactVirtualized__List')
      || null;
    const listScroller = leftPanel?.querySelector('.ReactVirtualized__Grid.ReactVirtualized__List, .ReactVirtualized__Grid')
      || activePane?.querySelector('.list-zrsZ82 .ReactVirtualized__Grid.ReactVirtualized__List, .list-zrsZ82 .ReactVirtualized__Grid')
      || null;
    const messagePanel = document.querySelector('.box-container-yGo0TJ')
      || document.querySelector('.box-content-qyCVPY')?.parentElement
      || null;
    const commentContainer = document.querySelector('.container-AFENbv, .list-content, .comment-list, [class*="comment"]') || null;
    const viewport = {{
      innerWidth: window.innerWidth || 0,
      innerHeight: window.innerHeight || 0,
      docClientWidth: document.documentElement?.clientWidth || 0,
      docClientHeight: document.documentElement?.clientHeight || 0,
      bodyClientWidth: document.body?.clientWidth || 0,
      bodyClientHeight: document.body?.clientHeight || 0,
    }};
    const metrics = {{
      module: {json.dumps(module)},
      viewport,
      bodyRect: rectOf(document.body),
      rootRect: rectOf(document.documentElement),
      activePaneRect: rectOf(activePane),
      leftPanelRect: rectOf(leftPanel),
      messagePanelRect: rectOf(messagePanel),
      commentContainerRect: rectOf(commentContainer),
      leftPanelClientHeight: leftPanel?.clientHeight || 0,
      leftPanelScrollHeight: leftPanel?.scrollHeight || 0,
      listScrollerClientHeight: listScroller?.clientHeight || 0,
      listScrollerScrollHeight: listScroller?.scrollHeight || 0,
      messagePanelClientHeight: messagePanel?.clientHeight || 0,
      subAppText: textOf(document.querySelector('#sub-app')).slice(0, 120),
    }};

    let geometryReady = false;
    if ({json.dumps(module)} === 'dm') {{
      geometryReady = (
        viewport.docClientHeight >= 500 &&
        metrics.activePaneRect.h >= 320 &&
        (
          metrics.leftPanelRect.h >= 120 ||
          metrics.leftPanelClientHeight >= 120 ||
          metrics.listScrollerClientHeight >= 120 ||
          metrics.listScrollerScrollHeight >= 120 ||
          metrics.messagePanelRect.h >= 220 ||
          metrics.messagePanelClientHeight >= 220
        )
      );
    }} else {{
      geometryReady = (
        viewport.docClientHeight >= 500 &&
        metrics.activePaneRect.h >= 320 &&
        (metrics.commentContainerRect.h >= 120 || metrics.commentContainerRect.w >= 200)
      );
    }}

    return serialize({{ok: true, geometryReady, metrics}});
  }} catch (err) {{
    return JSON.stringify({{ok: false, geometryReady: false, error: String(err)}});
  }}
}})();
"""
