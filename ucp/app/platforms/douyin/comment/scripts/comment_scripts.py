from __future__ import annotations


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
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && parseFloat(style.opacity || '1') > 0.02
        && rect.width >= 2
        && rect.height >= 2;
    };
    const rectOf = (el) => {
      if (!el || !(el instanceof Element)) return {x: 0, y: 0, w: 0, h: 0};
      const r = el.getBoundingClientRect();
      return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)};
    };
    const isButtonLike = (el) => {
      if (!el || !(el instanceof Element)) return false;
      const tag = (el.tagName || '').toLowerCase();
      const role = el.getAttribute('role') || '';
      const style = window.getComputedStyle(el);
      return tag === 'button'
        || role === 'button'
        || role === 'link'
        || el.hasAttribute('onclick')
        || el.tabIndex >= 0
        || style.cursor === 'pointer'
        || (typeof el.className === 'string' && /(button|btn|trigger|selector|switcher)/i.test(el.className));
    };
    const resolveActionTarget = (el) => {
      if (!el || !(el instanceof Element)) return null;
      const chain = [
        el,
        el.closest('button'),
        el.closest('[role="button"]'),
        el.closest('.douyin-creator-interactive-button'),
        el.closest('.semi-button'),
        el.closest('[tabindex]'),
      ].filter(Boolean);
      const seen = new Set();
      for (const node of chain) {
        if (!(node instanceof Element)) continue;
        if (seen.has(node)) continue;
        seen.add(node);
        if (!visible(node)) continue;
        if (isButtonLike(node)) return node;
      }
      let cur = el.parentElement;
      while (cur) {
        if (visible(cur) && isButtonLike(cur)) return cur;
        cur = cur.parentElement;
      }
      return el;
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
          .split(/\\s+/)
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
      return isButtonLike(el) || ['a', 'input', 'textarea'].includes((el.tagName || '').toLowerCase());
    };
    const ownText = (el, omitSelectors = []) => {
      if (!el || !(el instanceof Element)) return '';
      const clone = el.cloneNode(true);
      omitSelectors.forEach((sel) => clone.querySelectorAll(sel).forEach((node) => node.remove()));
      return textOf(clone);
    };
    const hashReplyKey = (value) => {
      const text = String(value || '');
      let hash = 2166136261;
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(36);
    };
    const makeReplyDomKey = (threadAuthor, threadContent, level, index, author, content) => (
      'ucp_reply_' + hashReplyKey([threadAuthor || '', threadContent || '', level || '', String(index ?? -1), author || '', content || ''].join('\u241f'))
    );
    const replyRegistry = new Map();
    try { window.__ucpCommentReplyRegistry = replyRegistry; } catch (err) {}
    const registerReplyDom = (key, meta) => {
      if (!key || !meta || !(meta.replyLabel instanceof Element || meta.replyAction instanceof Element)) return;
      const entry = {
        key,
        card: meta.card instanceof Element ? meta.card : null,
        rootCard: meta.rootCard instanceof Element ? meta.rootCard : (meta.card instanceof Element && !meta.card.closest('.reply-list-QwXCb_') ? meta.card : null),
        replyLabel: meta.replyLabel instanceof Element ? meta.replyLabel : null,
        replyAction: meta.replyAction instanceof Element ? meta.replyAction : null,
        level: String(meta.level || ''),
        index: Number(meta.index ?? -1),
        author: String(meta.author || ''),
        content: String(meta.content || ''),
        threadAuthor: String(meta.threadAuthor || ''),
        threadContent: String(meta.threadContent || ''),
        createdAt: Date.now(),
      };
      try { if (entry.card) entry.card.setAttribute('data-ucp-comment-dom-key', key); } catch (err) {}
      try { if (entry.replyLabel) entry.replyLabel.setAttribute('data-ucp-reply-label-key', key); } catch (err) {}
      try { if (entry.replyAction) entry.replyAction.setAttribute('data-ucp-reply-action-key', key); } catch (err) {}
      replyRegistry.set(key, entry);
    };
    const extractCommentContent = (card, authorText = '', timeText = '') => {
      if (!card || !(card instanceof Element)) return '';
      const richTextOf = (node) => {
        if (!node) return '';
        const parts = [];
        const walk = (cur) => {
          if (!cur) return;
          if (cur.nodeType === Node.TEXT_NODE) {
            parts.push(cur.textContent || '');
            return;
          }
          if (!(cur instanceof Element)) return;
          const tag = (cur.tagName || '').toLowerCase();
          if (tag === 'img') {
            parts.push(cur.getAttribute('alt') || cur.getAttribute('data-type') || cur.getAttribute('title') || cur.getAttribute('aria-label') || '');
            return;
          }
          if (tag === 'br') {
            parts.push(' ');
            return;
          }
          Array.from(cur.childNodes || []).forEach(walk);
        };
        walk(node);
        return parts.join('').replace(/\s+/g, ' ').trim();
      };
      const direct = Array.from(card.querySelectorAll('.comment-content-text-JvmAKq, [class*="comment-content-text"], [class*="comment-content"], [class*="content-text"], [class*="commentText"]'))
        .map((node) => richTextOf(node) || textOf(node))
        .find(Boolean);
      if (direct) return direct.slice(0, 240);
      const clone = card.cloneNode(true);
      clone.querySelectorAll('img').forEach((node) => {
        const token = node.getAttribute('alt') || node.getAttribute('data-type') || node.getAttribute('title') || node.getAttribute('aria-label') || '';
        try {
          node.replaceWith(document.createTextNode(token));
        } catch (err) {}
      });
      [
        '.username-aLgaNB', '[class*="username"]', '.tag-DAEcKE', '[class*="tag-"]',
        '.time-NRtTXO', '[class*="time-"]', '.operations-WFV7Am', '[class*="operation"]',
        '.reply-list-QwXCb_', '[class*="reply-list"]', '.reply-content-obcMk0', '.reply-NYBpwz',
        '.wrap-NeUN4f', '.footer-oZJTJd', '[contenteditable="true"]', 'textarea', 'button',
        '.douyin-creator-interactive-popover', '.douyin-creator-interactive-select',
      ].forEach((sel) => clone.querySelectorAll(sel).forEach((node) => node.remove()));
      let text = richTextOf(clone) || textOf(clone);
      [authorText, timeText, '回复', '点赞', '取消', '发送'].filter(Boolean).forEach((token) => {
        text = text.replace(token, ' ');
      });
      return text.replace(/\s+/g, ' ').trim().slice(0, 240);
    };
    const nearestCardAnchor = (el) => {
      if (!el || !(el instanceof Element)) return '';
      const card = el.closest('.container-sXKyMs') || el.parentElement?.querySelector?.('.container-sXKyMs') || null;
      const authorNode = card ? card.querySelector('.username-aLgaNB') : null;
      return ownText(authorNode, ['.tag-DAEcKE']);
    };
    const findLocalReplyEditor = (host, band = null) => {
      if (!host || !(host instanceof Element)) return null;
      const selector = '.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6';
      const localCandidates = [host, ...Array.from(host.querySelectorAll(selector))];
      // 抖音评论回复编辑器有时会被挂到线程容器外层，尤其是多层嵌套回复。
      // 旧逻辑只查 host 子树，点击已打开编辑器但巡检确认不到，随后触发超时/作品刷新。
      // 这里仅在同一可视纵向区间 band 内补充全局候选，避免串到其他评论。
      const globalCandidates = band ? Array.from(document.querySelectorAll(selector)).filter((node) => nodeInBand(node, band)) : [];
      const candidates = [...localCandidates, ...globalCandidates]
        .filter((node, index, arr) => node instanceof Element && arr.indexOf(node) === index)
        .filter(visible);
      for (const node of candidates) {
        const inputNode = node.matches?.('.input-d24X73[contenteditable="true"], .textarea-NCe55j, textarea, [contenteditable="true"]')
          ? node
          : node.querySelector('.input-d24X73[contenteditable="true"], .textarea-NCe55j, textarea, [contenteditable="true"]');
        if (!inputNode || !visible(inputNode)) continue;
        if (band && !nodeInBand(inputNode, band) && !nodeInBand(node, band)) continue;
        const placeholder = inputNode.getAttribute('placeholder') || inputNode.getAttribute('aria-placeholder') || '';
        const footer = node.querySelector('.footer-oZJTJd') || node.closest('.wrap-NeUN4f')?.querySelector('.footer-oZJTJd') || node;
        const sendNode = Array.from(footer.querySelectorAll('button, [role="button"], span, div')).find((el) => visible(el) && textOf(el) === '发送') || null;
        const cancelNode = Array.from(footer.querySelectorAll('button, [role="button"], span, div')).find((el) => visible(el) && textOf(el) === '取消') || null;
        const isReplyScoped = placeholder.startsWith('回复') || !!cancelNode || !!sendNode || !!node.closest('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6');
        if (isReplyScoped) {
          const editorNode = (node === inputNode)
            ? (inputNode.closest('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6') || inputNode.parentElement || inputNode)
            : node;
          const editorFooter = editorNode.querySelector?.('.footer-oZJTJd') || editorNode.closest?.('.wrap-NeUN4f')?.querySelector?.('.footer-oZJTJd') || editorNode;
          const editorSendNode = Array.from(editorFooter.querySelectorAll?.('button, [role="button"], span, div') || []).find((el) => visible(el) && textOf(el) === '发送') || sendNode || null;
          const editorCancelNode = Array.from(editorFooter.querySelectorAll?.('button, [role="button"], span, div') || []).find((el) => visible(el) && textOf(el) === '取消') || cancelNode || null;
          return {node: editorNode, inputNode, sendNode: editorSendNode, cancelNode: editorCancelNode, placeholder};
        }
      }
      return null;
    };

    const root = document.querySelector('.container-AFENbv');
    const moduleTitleNode = root?.querySelector('.title-V3HpNi');
    const currentWorkTitleNode = root?.querySelector('.content-T9PTck .title-iqC0Gj');
    const currentWorkMetaNode = root?.querySelector('.content-T9PTck .desc-uISkyj');

    const workSelectorSource = Array.from(document.querySelectorAll('button, [role="button"], span, div'))
      .find((el) => visible(el) && textOf(el) === '选择作品') || null;
    const workSelectorButton = resolveActionTarget(workSelectorSource);

    const selectControls = Array.from((document.querySelector('.operations-o6e97h') || document).querySelectorAll('[role="combobox"], .douyin-creator-interactive-select'))
      .filter((el) => el instanceof Element && visible(el));
    const readSelectControl = (el) => {
      if (!el || !(el instanceof Element)) return {found: false};
      const textNode = el.querySelector('.douyin-creator-interactive-select-selection-text');
      const selectedText = textOf(textNode || el);
      const ariaControls = el.getAttribute('aria-controls') || '';
      const popupId = el.getAttribute('data-popupid') || '';
      const expanded = String(el.getAttribute('aria-expanded') || '').toLowerCase() === 'true'
        || (typeof el.className === 'string' && el.className.includes('select-open'));
      return {
        found: true,
        selectedText,
        expanded,
        rect: rectOf(el),
        hint: pathHint(el),
        ariaControls,
        popupId,
      };
    };
    const commentFilterControl = selectControls.find((el) => {
      const selectedText = textOf(el.querySelector('.douyin-creator-interactive-select-selection-text') || el);
      return ['全部评论', '未回复', '包含问题', '可能打扰'].some((label) => selectedText.includes(label));
    }) || null;
    const audienceFilterControl = selectControls.find((el) => {
      if (commentFilterControl && el === commentFilterControl) return false;
      const selectedText = textOf(el.querySelector('.douyin-creator-interactive-select-selection-text') || el);
      return ['全部人群', '粉丝', '路人', '新粉'].some((label) => selectedText.includes(label));
    }) || null;
    const sortControl = selectControls.find((el) => {
      if (commentFilterControl && el === commentFilterControl) return false;
      if (audienceFilterControl && el === audienceFilterControl) return false;
      const selectedText = textOf(el.querySelector('.douyin-creator-interactive-select-selection-text') || el);
      return ['最新发布', '最早发布', '最新回复', '最早回复'].some((label) => selectedText.includes(label));
    }) || null;

    const drawerRoot = Array.from(document.querySelectorAll(
      '.douyin-creator-interactive-sidesheet, .douyin-creator-interactive-portal, [class*="sidesheet"], [class*="drawer"], [class*="portal"]'
    )).find((el) => visible(el) && (textOf(el).includes('作品列表') || textOf(el).includes('个视频'))) || null;
    const drawerTitleNode = drawerRoot?.querySelector('.title-OpLJVW, .douyin-creator-interactive-sidesheet-title');
    const drawerMetaNode = drawerRoot?.querySelector('.right-T1SMSq, [class*="right-"]');
    const workItemsRaw = Array.from(drawerRoot?.querySelectorAll('.container-Lkxos9, [class*="container-Lkxos9"]') || []).filter((el) => {
      if (!visible(el)) return false;
      const txt = textOf(el);
      return !!txt && (txt.includes('发布') || /\d{2}:\d{2}|\d{4}年\d{2}月\d{2}日/.test(txt));
    });
    const workItems = workItemsRaw.map((item, index) => {
      const titleNode = item.querySelector('.title-LUOP3b, [class*="title-"]');
      const timeNode = item.querySelector('.time-UjQLwk, [class*="time-"]');
      const rightNode = item.querySelector('.right-os7ZB9, [class*="right-"]');
      const countNode = rightNode ? Array.from(rightNode.children || []).find((child) => child.tagName && child.tagName.toLowerCase() === 'div') : null;
      return {
        index,
        title: textOf(titleNode),
        timeText: textOf(timeNode),
        badgeText: textOf(countNode || rightNode).replace(/^[^0-9]*/, ''),
        active: (typeof item.className === 'string' ? item.className : '').includes('active-'),
        rect: rectOf(item),
        hint: pathHint(item),
      };
    });

    const allVisibleCards = Array.from(document.querySelectorAll('.container-sXKyMs')).filter(visible);
    const topLevelCards = allVisibleCards
      .filter((card) => !card.closest('.reply-list-QwXCb_'))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const nestedCards = allVisibleCards
      .filter((card) => !!card.closest('.reply-list-QwXCb_'))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

    const cardBand = (card) => {
      const index = topLevelCards.indexOf(card);
      const rect = card.getBoundingClientRect();
      const next = index >= 0 ? topLevelCards[index + 1] : null;
      const nextRect = next ? next.getBoundingClientRect() : null;
      return {
        index,
        top: rect.top - 2,
        bottom: nextRect ? (nextRect.top - 2) : Number.POSITIVE_INFINITY,
      };
    };
    const nodeInBand = (node, band) => {
      if (!node || !(node instanceof Element) || !band) return false;
      const r = node.getBoundingClientRect();
      const y = r.top + Math.min(Math.max(r.height / 2, 1), 12);
      return y >= band.top && y < band.bottom;
    };
    const findThreadHost = (card) => {
      // 只用于定位编辑器等局部操作；子回复和“查看N条回复”严格按可视纵向区间归属，避免共享父容器导致串线。
      let cur = card && card.parentElement ? card.parentElement : card;
      for (let i = 0; i < 4 && cur; i += 1) {
        const text = textOf(cur);
        const directCardCount = Array.from(cur.querySelectorAll('.container-sXKyMs')).filter((node) => !node.closest('.reply-list-QwXCb_')).length;
        if ((text.includes('查看') || text.includes('收起') || cur.querySelector('.reply-list-QwXCb_')) && directCardCount <= 1) {
          return cur;
        }
        cur = cur.parentElement;
      }
      return (card && card.parentElement) || card;
    };
    const nestedCardsForTopCard = (card) => {
      const band = cardBand(card);
      return nestedCards.filter((node) => nodeInBand(node, band));
    };
    const findCollapsedReplyTriggerForTopCard = (card, host) => {
      const band = cardBand(card);
      const scope = (host && host instanceof Element) ? host : document;
      const localNodes = Array.from(scope.querySelectorAll('.load-more-pDyh1o, [class*="load-more"], button, [role="button"], a, span, div'));
      const globalNodes = Array.from(document.querySelectorAll('.load-more-pDyh1o, [class*="load-more"], button, [role="button"], a, span, div'));
      const nodes = uniqBy([...localNodes, ...globalNodes], (node) => node)
        .filter((el) => el instanceof Element && visible(el) && nodeInBand(el, band));
      const choices = nodes
        .map((el) => {
          const info = collapsedReplyTextInfo(textOf(el));
          if (!info.contains) return null;
          const r = el.getBoundingClientRect();
          const className = typeof el.className === 'string' ? el.className : '';
          const tag = (el.tagName || '').toLowerCase();
          const isLoadMoreClass = /load-more/i.test(className);
          const buttonLike = isButtonLike(el) || tag === 'button' || tag === 'a' || isLoadMoreClass;
          const noisyContainer = !info.exact && /回复\s*删除|删除\s*举报|举报/.test(info.text);
          return {
            el,
            text: info.text,
            exact: info.exact,
            contains: info.contains,
            buttonLike,
            isLoadMoreClass,
            noisyContainer,
            textLen: info.text.length,
            area: Math.round(r.width * r.height),
          };
        })
        .filter(Boolean)
        .filter((x) => x.exact || x.isLoadMoreClass || (x.buttonLike && x.textLen <= 32 && x.area <= 50000))
        .sort((a, b) => (
          (Number(b.exact) - Number(a.exact))
          || (Number(b.isLoadMoreClass) - Number(a.isLoadMoreClass))
          || (Number(b.buttonLike) - Number(a.buttonLike))
          || (Number(a.noisyContainer) - Number(b.noisyContainer))
          || (a.textLen - b.textLen)
          || (a.area - b.area)
        ));
      return choices.length ? choices[0].el : null;
    };

    const mapReplyButton = (opsNode) => {
      if (!opsNode || !(opsNode instanceof Element)) {
        return {replyBtn: null, replyLabel: null, replyAction: null, replyButtonSafe: false, replyButtonText: ''};
      }
      const safeReplyText = (value) => {
        const t = String(value || '').replace(/\s+/g, ' ').trim();
        return /^回复(?:\s*[（(]?\d+[）)]?)?$/.test(t) && !/删除|举报|取消|发送/.test(t);
      };
      const allNodes = Array.from(opsNode.querySelectorAll('.item-M3fSkJ, button, [role="button"], span, div, a'))
        .filter((el) => el instanceof Element && visible(el));
      const labels = allNodes
        .filter((el) => textOf(el) === '回复')
        .filter((el) => !Array.from(el.children || []).some((child) => visible(child) && textOf(child) === '回复'))
        .sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return (ra.width * ra.height) - (rb.width * rb.height);
        });
      const label = labels.length ? labels[0] : null;
      const resolveAction = (source) => {
        let cur = source;
        while (cur && cur instanceof Element && cur !== opsNode) {
          const actionLike = cur.matches('button,[role="button"],.item-M3fSkJ,[class*="item-"]') || cur.parentElement === opsNode;
          if (actionLike && visible(cur) && safeReplyText(textOf(cur))) return cur;
          cur = cur.parentElement;
        }
        return source && visible(source) && safeReplyText(textOf(source)) ? source : null;
      };
      const action = resolveAction(label) || Array.from(opsNode.querySelectorAll('.item-M3fSkJ, button, [role="button"]'))
        .filter((el) => visible(el) && safeReplyText(textOf(el)))
        .sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return (ra.width * ra.height) - (rb.width * rb.height);
        })[0] || null;
      const preferred = label || action;
      return {
        replyBtn: preferred,
        replyLabel: label,
        replyAction: action,
        replyButtonSafe: !!preferred && safeReplyText(textOf(preferred)),
        replyButtonText: preferred ? textOf(preferred) : '',
      };
    };
    const findOwnOperations = (card) => {
      if (!card || !(card instanceof Element)) return null;
      const cardRect = card.getBoundingClientRect();
      return Array.from(card.querySelectorAll('.operations-WFV7Am, [class*="operations-"]'))
        .filter((el) => el instanceof Element && visible(el))
        .filter((el) => {
          const ownerCard = el.closest('.container-sXKyMs');
          return ownerCard === card;
        })
        .sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return Math.abs(ra.top - cardRect.top) - Math.abs(rb.top - cardRect.top);
        })[0] || null;
    };

    const collapsedReplyTextInfo = (text) => {
      const t = String(text || '').replace(/\s+/g, ' ').trim();
      const exact = /^查看\s*\d+\s*条回复$/.test(t);
      const contains = /查看\s*\d+\s*条回复/.test(t) || (t.includes('查看') && t.includes('条回复'));
      return {text: t, exact, contains};
    };
    const findCollapsedReplyTrigger = (host) => {
      const scope = (host && host instanceof Element) ? host : document;
      const nodes = Array.from(scope.querySelectorAll('.load-more-pDyh1o, [class*="load-more"], button, [role="button"], a, span, div'))
        .filter((el) => el instanceof Element && visible(el));
      const choices = nodes
        .map((el) => {
          const info = collapsedReplyTextInfo(textOf(el));
          if (!info.contains) return null;
          const r = el.getBoundingClientRect();
          const className = typeof el.className === 'string' ? el.className : '';
          const tag = (el.tagName || '').toLowerCase();
          const isLoadMoreClass = /load-more/i.test(className);
          const buttonLike = isButtonLike(el) || tag === 'button' || tag === 'a' || isLoadMoreClass;
          const noisyContainer = !info.exact && /回复\s*删除|删除\s*举报|举报/.test(info.text);
          return {
            el,
            text: info.text,
            exact: info.exact,
            contains: info.contains,
            buttonLike,
            isLoadMoreClass,
            noisyContainer,
            textLen: info.text.length,
            area: Math.round(r.width * r.height),
          };
        })
        .filter(Boolean)
        .filter((x) => x.exact || x.isLoadMoreClass || (x.buttonLike && x.textLen <= 32 && x.area <= 50000))
        .sort((a, b) => (
          (Number(b.exact) - Number(a.exact))
          || (Number(b.isLoadMoreClass) - Number(a.isLoadMoreClass))
          || (Number(b.buttonLike) - Number(a.buttonLike))
          || (Number(a.noisyContainer) - Number(b.noisyContainer))
          || (a.textLen - b.textLen)
          || (a.area - b.area)
        ));
      return choices.length ? choices[0].el : null;
    };

    const mapNestedReply = (node, index) => {
      const nestedAuthor = node.querySelector('.username-aLgaNB');
      const nestedTag = nestedAuthor?.querySelector('.tag-DAEcKE');
      const nestedTime = node.querySelector('.time-NRtTXO');
      const nestedOps = findOwnOperations(node);
      const nestedAuthorName = ownText(nestedAuthor, ['.tag-DAEcKE']);
      const nestedTimeText = textOf(nestedTime);
      const nestedContent = extractCommentContent(node, nestedAuthorName, nestedTimeText).slice(0, 200);
      const nestedReply = mapReplyButton(nestedOps);
      const nestedReplyBtn = nestedReply.replyBtn;
      const item = {
        level: 'nested',
        index,
        author: nestedAuthorName,
        authorTag: textOf(nestedTag),
        isAuthor: textOf(nestedTag).includes('作者'),
        content: nestedContent,
        timeText: nestedTimeText,
        replyButtonFound: !!nestedReplyBtn,
        replyButtonClickable: !!nestedReplyBtn && clickable(nestedReplyBtn),
        replyButtonHint: nestedReplyBtn ? pathHint(nestedReplyBtn) : '',
        rect: rectOf(node),
        hint: pathHint(node),
      };
      Object.defineProperty(item, '__replyDom', {value: nestedReply, enumerable: false});
      return item;
    };

    const mapCard = (card, level) => {
      const authorNode = card.querySelector('.username-aLgaNB');
      const authorTagNode = authorNode?.querySelector('.tag-DAEcKE');
      const timeNode = card.querySelector('.time-NRtTXO');
      const opsNode = findOwnOperations(card);
      const topReplyDom = mapReplyButton(opsNode);
      const replyBtn = topReplyDom.replyBtn;
      const threadHost = findThreadHost(card);
      const band = cardBand(card);
      const nestedReplyCards = nestedCardsForTopCard(card);
      const nestedReplyItems = nestedReplyCards.map((node, index) => mapNestedReply(node, index));
      const nestedReplySamples = nestedReplyItems.slice(0, 8);
      const replyEditorMatch = findLocalReplyEditor(threadHost, band);
      const replyEditor = replyEditorMatch?.node || null;
      const replySend = replyEditorMatch?.sendNode || null;
      const replyCancel = replyEditorMatch?.cancelNode || null;
      const actionTexts = Array.from(opsNode?.querySelectorAll('.item-M3fSkJ, button, [role="button"], span, div') || [])
        .filter(visible)
        .map((el) => textOf(el))
        .filter(Boolean);
      const loadMore = findCollapsedReplyTriggerForTopCard(card, threadHost);
      const loadMoreText = textOf(loadMore);
      const loadMoreInfo = collapsedReplyTextInfo(loadMoreText);
      const hasCollapsedReplies = !!loadMore && loadMoreInfo.contains;
      const collapsedReplyCountMatch = loadMoreText.match(/查看\s*(\d+)\s*条回复/);
      const collapsedReplyCount = collapsedReplyCountMatch ? Number(collapsedReplyCountMatch[1] || 0) : 0;
      const authorName = ownText(authorNode, ['.tag-DAEcKE']);
      const authorTagText = textOf(authorTagNode);
      const timeText = textOf(timeNode);
      const contentText = extractCommentContent(card, authorName, timeText);
      const threadKey = [authorName, timeText, contentText.slice(0, 80)].join(' | ');
      const topIsAuthor = authorTagText.includes('作者');
      const threadAuthorByBadge = topIsAuthor
        ? authorName
        : ((nestedReplyItems.find((item) => item && item.isAuthor && item.author) || {}).author || '');
      nestedReplyItems.forEach((item) => {
        item.parentThreadKey = threadKey;
        item.authorDetectBy = item.isAuthor ? 'local_badge' : 'no_local_badge';
        item.confirmedAuthorName = threadAuthorByBadge;
        item.messageKey = [threadKey, item.level || 'nested', String(item.index ?? -1), item.author || '', item.timeText || '', String(item.content || '').slice(0, 80)].join(' | ');
      });
      const topMessage = {
        level: 'top',
        index: -1,
        author: authorName,
        authorTag: authorTagText,
        isAuthor: topIsAuthor,
        authorDetectBy: topIsAuthor ? 'local_badge' : 'no_local_badge',
        confirmedAuthorName: threadAuthorByBadge,
        content: contentText.slice(0, 200),
        timeText,
      };
      topMessage.parentThreadKey = threadKey;
      topMessage.messageKey = [threadKey, 'top', '-1', authorName || '', timeText || '', String(contentText || '').slice(0, 80)].join(' | ');
      topMessage.replyDomKey = makeReplyDomKey(authorName, contentText, 'top', -1, authorName, contentText);
      registerReplyDom(topMessage.replyDomKey, {
        card,
        rootCard: card,
        replyLabel: topReplyDom.replyLabel,
        replyAction: topReplyDom.replyAction,
        level: 'top',
        index: -1,
        author: authorName,
        content: contentText,
        threadAuthor: authorName,
        threadContent: contentText,
      });
      nestedReplyItems.forEach((item) => {
        item.replyDomKey = makeReplyDomKey(authorName, contentText, item.level || 'nested', item.index ?? -1, item.author || '', item.content || '');
        const dom = item.__replyDom || {};
        registerReplyDom(item.replyDomKey, {
          card: nestedReplyCards[Number(item.index ?? -1)] || null,
          rootCard: card,
          replyLabel: dom.replyLabel,
          replyAction: dom.replyAction,
          level: item.level || 'nested',
          index: item.index ?? -1,
          author: item.author || '',
          content: item.content || '',
          threadAuthor: authorName,
          threadContent: contentText,
        });
      });
      const visibleMessages = [topMessage, ...nestedReplyItems]
        .filter((item) => (item.content || '').trim() || (item.author || '').trim())
        .map((item, timelineIndex) => ({...item, timelineIndex}));
      const effectiveMessages = visibleMessages.filter((item) => (item.content || '').trim());
      const lastEffectiveMessage = effectiveMessages.length ? effectiveMessages[effectiveMessages.length - 1] : null;
      const lastVisibleUserMessage = [...effectiveMessages].reverse().find((item) => !item.isAuthor) || null;
      const hasAuthorReplyInThread = nestedReplyItems.some((item) => item.isAuthor);
      const hasAuthorAnyInThread = effectiveMessages.some((item) => item.isAuthor);
      const lastAuthorTimelineIndex = effectiveMessages.reduce((acc, item) => item.isAuthor ? Math.max(acc, Number(item.timelineIndex ?? -1)) : acc, -1);
      let replyNeedReason = '';
      let replyTargetMessage = null;
      if (!hasCollapsedReplies) {
        if (hasAuthorAnyInThread) {
          // 多回复线程：只允许“作者 badge 消息之后的最后一条用户消息”成为回复目标。
          // 顶层首评如果已经被作者回复过，不再作为候选，避免重复回复首评。
          if (lastEffectiveMessage && !lastEffectiveMessage.isAuthor && Number(lastEffectiveMessage.timelineIndex ?? -1) > lastAuthorTimelineIndex) {
            replyNeedReason = 'user_followup_after_author_reply';
            replyTargetMessage = lastEffectiveMessage;
          }
        } else if (topMessage && !topMessage.isAuthor && (topMessage.content || '').trim()) {
          replyNeedReason = 'top_user_without_author_reply';
          replyTargetMessage = topMessage;
        }
      }
      return {
        level,
        threadKey,
        author: authorName,
        authorTag: authorTagText,
        isAuthor: topIsAuthor,
        authorDetectBy: topIsAuthor ? 'local_badge' : 'no_local_badge',
        confirmedAuthorName: threadAuthorByBadge,
        timeText,
        content: contentText.slice(0, 200),
        rect: rectOf(card),
        hint: pathHint(card),
        replyButtonFound: !!replyBtn,
        replyButtonClickable: !!replyBtn && clickable(replyBtn),
        replyButtonHint: replyBtn ? pathHint(replyBtn) : '',
        replyDomKey: topMessage.replyDomKey || '',
        actionTexts: uniqBy(actionTexts, (v) => v),
        replyExpanded: nestedReplyCards.length > 0,
        nestedReplyCount: nestedReplyCards.length,
        nestedReplySamples,
        // 保留完整可见嵌套时间线，不能只截前 12 条；长线程的新追问通常在末尾，
        // 截断会导致页面文本里有新评论，但结构化候选仍命中旧 sent/not_required 记录。
        nestedReplies: nestedReplyItems.slice(0, 120),
        hasAuthorReplyInThread,
        hasCollapsedReplies,
        collapsedReplyCount,
        loadMoreText,
        loadMoreExact: !!(loadMoreInfo && loadMoreInfo.exact),
        loadMoreHint: loadMore ? pathHint(loadMore) : '',
        loadMoreRect: loadMore ? rectOf(loadMore) : {x: 0, y: 0, w: 0, h: 0},
        lastEffectiveMessage: lastEffectiveMessage || {},
        lastVisibleUserMessage: lastVisibleUserMessage || {},
        replyTargetMessage: replyTargetMessage || {},
        replyNeedReason,
        replyEditorVisible: !!replyEditor && visible(replyEditor),
        replyEditorPlaceholder: replyEditorMatch ? replyEditorMatch.placeholder : '',
        replyEditorHint: replyEditor ? pathHint(replyEditor) : '',
        replySendFound: !!replySend,
        replyCancelFound: !!replyCancel,
      };
    };

    const topComments = topLevelCards.map((card) => mapCard(card, 'top'));
    const nestedSamples = nestedCards.slice(0, 8).map((card, index) => mapNestedReply(card, index));
    const unrepliedHeuristic = topComments
      .filter((item) => item.replyButtonFound && !item.hasCollapsedReplies && item.replyNeedReason && item.replyTargetMessage && !item.replyTargetMessage.isAuthor)
      .map((item) => {
        const target = item.replyTargetMessage || {};
        return {
          threadKey: item.threadKey,
          targetMessageKey: target.messageKey || '',
          replyDomKey: target.replyDomKey || '',
          targetParentThreadKey: target.parentThreadKey || item.threadKey,
          author: target.author || item.author,
          content: target.content || item.content,
          timeText: target.timeText || item.timeText,
          targetLevel: target.level || 'top',
          targetIndex: target.index ?? -1,
          targetIsAuthor: !!target.isAuthor,
          authorDetectBy: target.authorDetectBy || '',
          confirmedAuthorName: item.confirmedAuthorName || target.confirmedAuthorName || '',
          replyNeedReason: item.replyNeedReason,
          nestedReplyCount: item.nestedReplyCount,
          loadMoreText: item.loadMoreText,
        };
      });

    const topComposer = document.querySelector('.input-d24X73[contenteditable="true"], .input-d24X73');
    const topSendButton = document.querySelector('.footer-oZJTJd button');
    const replyEditorEntries = topLevelCards.map((card) => {
      const threadHost = findThreadHost(card);
      const band = cardBand(card);
      const match = findLocalReplyEditor(threadHost, band);
      if (!match) return null;
      return {card, threadHost, band, match};
    }).filter(Boolean);
    const replyEditors = uniqBy(replyEditorEntries.map((entry) => {
      const editor = entry.match.node;
      const sendNode = entry.match.sendNode || Array.from(editor.querySelectorAll('button, [role="button"], span, div')).find((el) => visible(el) && textOf(el) === '发送') || null;
      const cancelNode = entry.match.cancelNode || Array.from(editor.querySelectorAll('button, [role="button"], span, div')).find((el) => visible(el) && textOf(el) === '取消') || null;
      return {
        anchorAuthor: ownText(entry.card.querySelector('.username-aLgaNB'), ['.tag-DAEcKE']),
        rect: rectOf(editor),
        hint: pathHint(editor),
        inputPlaceholder: entry.match.placeholder || (entry.match.inputNode ? (entry.match.inputNode.getAttribute('placeholder') || entry.match.inputNode.getAttribute('aria-placeholder') || '') : ''),
        sendFound: !!sendNode,
        cancelFound: !!cancelNode,
      };
    }), (item) => [item.anchorAuthor, item.rect.x, item.rect.y, item.inputPlaceholder].join('|'));

    const activeElement = document.activeElement instanceof Element ? document.activeElement : null;
    const activeClosestCard = activeElement ? activeElement.closest('.container-sXKyMs') : null;
    const activeClosestReplyWrap = activeElement ? activeElement.closest('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6') : null;
    const activeClosestTopComposer = activeElement ? activeElement.closest('.content-wWJcbN') : null;
    const visibleEditables = Array.from(document.querySelectorAll('[contenteditable="true"], textarea, input'))
      .filter((el) => el instanceof Element && visible(el))
      .slice(0, 12)
      .map((el) => ({
        tag: (el.tagName || '').toLowerCase(),
        className: typeof el.className === 'string' ? el.className.slice(0, 160) : '',
        placeholder: el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || '',
        text: textOf(el).slice(0, 80),
        editable: el.getAttribute('contenteditable') || '',
        rect: rectOf(el),
        hint: pathHint(el),
        inReplyWrap: !!el.closest('.reply-content-obcMk0, .reply-NYBpwz'),
        inTopComposer: !!el.closest('.content-wWJcbN'),
      }));
    const visibleLoadingTexts = Array.from(document.querySelectorAll('[class*=loading], [class*=spin], [class*=empty], [class*=placeholder], [class*=skeleton]'))
      .filter((el) => el instanceof Element && visible(el))
      .map((el) => textOf(el))
      .filter(Boolean)
      .slice(0, 8);
    const visiblePopoverTexts = Array.from(document.querySelectorAll('.douyin-creator-interactive-popover, .douyin-creator-interactive-select-option-list-wrapper, [class*=popover], [class*=dropdown]'))
      .filter((el) => el instanceof Element && visible(el))
      .map((el) => textOf(el).slice(0, 120))
      .filter(Boolean)
      .slice(0, 8);

    const listContainer = topLevelCards.length
      ? (topLevelCards[0].parentElement?.parentElement || topLevelCards[0].parentElement || null)
      : (document.querySelector('.container-Pr4RHc') || root || null);

    const describeScroller = (node) => {
      if (!node) return {found: false};
      const isDoc = node === document.scrollingElement || node === document.documentElement || node === document.body;
      const el = isDoc ? (document.scrollingElement || document.documentElement || document.body) : node;
      if (!el) return {found: false};
      const scrollTop = Number(el.scrollTop || 0);
      const clientHeight = Number(el.clientHeight || window.innerHeight || 0);
      const scrollHeight = Number(el.scrollHeight || 0);
      const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
      return {
        found: true,
        isDocument: !!isDoc,
        tag: isDoc ? 'document' : ((el.tagName || '').toLowerCase()),
        className: (!isDoc && typeof el.className === 'string') ? el.className.slice(0, 160) : '',
        hint: isDoc ? 'document.scrollingElement' : pathHint(el),
        scrollTop: Math.round(scrollTop),
        clientHeight: Math.round(clientHeight),
        scrollHeight: Math.round(scrollHeight),
        maxScrollTop: Math.round(maxScrollTop),
        canScrollDown: maxScrollTop - scrollTop > Math.max(24, clientHeight * 0.08),
        atBottom: maxScrollTop - scrollTop <= Math.max(24, clientHeight * 0.08),
      };
    };
    const findCommentListScroller = () => {
      const base = listContainer || root || document.body;
      const candidates = [];
      let cur = base;
      for (let i = 0; i < 8 && cur; i += 1) {
        candidates.push(cur);
        cur = cur.parentElement;
      }
      candidates.push(
        document.querySelector('.container-Pr4RHc'),
        document.querySelector('.container-AFENbv'),
        document.querySelector('[class*=comment]'),
        document.scrollingElement,
        document.documentElement,
        document.body,
      );
      const uniq = uniqBy(candidates.filter(Boolean), (el) => el);
      const scrollable = uniq
        .map((el) => ({el, info: describeScroller(el)}))
        .filter((x) => x.info.found && x.info.scrollHeight > x.info.clientHeight + 32)
        .sort((a, b) => {
          const aContains = topLevelCards[0] && a.el instanceof Element && a.el.contains(topLevelCards[0]);
          const bContains = topLevelCards[0] && b.el instanceof Element && b.el.contains(topLevelCards[0]);
          return (Number(bContains) - Number(aContains)) || ((a.info.scrollHeight - a.info.clientHeight) - (b.info.scrollHeight - b.info.clientHeight));
        });
      return scrollable.length ? scrollable[0].info : describeScroller(document.scrollingElement || document.documentElement || document.body);
    };
    const listScroller = findCommentListScroller();

    return serialize({
      ok: true,
      module: 'comment',
      url: location.href,
      title: document.title || '',
      header: {
        found: !!root,
        title: textOf(moduleTitleNode),
        currentWorkTitle: textOf(currentWorkTitleNode),
        currentWorkMeta: textOf(currentWorkMetaNode),
        rect: rectOf(root),
        hint: pathHint(root),
      },
      workSelector: workSelectorButton ? {
        found: true,
        text: textOf(workSelectorButton),
        clickable: clickable(workSelectorButton),
        rect: rectOf(workSelectorButton),
        hint: pathHint(workSelectorButton),
        tag: (workSelectorButton.tagName || '').toLowerCase(),
      } : {found: false},
      commentFilter: readSelectControl(commentFilterControl),
      audienceFilter: readSelectControl(audienceFilterControl),
      sortControl: readSelectControl(sortControl),
      workDrawer: drawerRoot ? {
        found: true,
        title: textOf(drawerTitleNode),
        metaText: textOf(drawerMetaNode),
        rect: rectOf(drawerRoot),
        hint: pathHint(drawerRoot),
        bottomText: textOf(drawerRoot.querySelector('.loading-_6JQ2i')),
        itemCount: workItems.length,
        items: workItems.slice(0, 20),
      } : {found: false},
      commentList: listContainer ? {
        found: true,
        rect: rectOf(listContainer),
        hint: pathHint(listContainer),
        topLevelCount: topComments.length,
        visibleCardCount: allVisibleCards.length,
        scroller: listScroller,
      } : {found: false, scroller: listScroller},
      topComments: uniqBy(topComments, (item) => [item.threadKey, item.rect.y].join('|')).slice(0, 16),
      nestedSamples: uniqBy(nestedSamples, (item) => [item.threadKey, item.rect.y].join('|')).slice(0, 10),
      unrepliedHeuristic: uniqBy(unrepliedHeuristic, (item) => item.threadKey).slice(0, 10),
      composers: {
        topComposer: topComposer && visible(topComposer) ? {
          found: true,
          placeholder: topComposer.getAttribute('placeholder') || topComposer.getAttribute('aria-placeholder') || '',
          editable: topComposer.getAttribute('contenteditable') || '',
          rect: rectOf(topComposer),
          hint: pathHint(topComposer),
          sendButtonText: textOf(topSendButton),
        } : {found: false},
        replyEditors: replyEditors.slice(0, 8),
      },
      diagnostics: {
        now: Date.now(),
        performanceNow: Math.round(performance.now()),
        documentHidden: !!document.hidden,
        activeElement: activeElement ? {
          tag: (activeElement.tagName || '').toLowerCase(),
          className: typeof activeElement.className === 'string' ? activeElement.className.slice(0, 180) : '',
          id: activeElement.id || '',
          role: activeElement.getAttribute('role') || '',
          placeholder: activeElement.getAttribute('placeholder') || activeElement.getAttribute('aria-placeholder') || '',
          text: textOf(activeElement).slice(0, 120),
          editable: activeElement.getAttribute('contenteditable') || '',
          rect: rectOf(activeElement),
          hint: pathHint(activeElement),
          inReplyWrap: !!activeClosestReplyWrap,
          inTopComposer: !!activeClosestTopComposer,
          closestCardHint: activeClosestCard ? pathHint(activeClosestCard) : '',
          closestCardText: activeClosestCard ? textOf(activeClosestCard).slice(0, 160) : '',
        } : {found: false},
        visibleEditableCount: visibleEditables.length,
        visibleEditableSamples: visibleEditables,
        visiblePopoverTexts,
        visibleLoadingTexts,
        bodyClass: typeof document.body?.className === 'string' ? document.body.className.slice(0, 180) : '',
      },
      counts: {
        workItems: workItems.length,
        topComments: topComments.length,
        visibleCardCount: allVisibleCards.length,
        nestedVisibleCards: nestedCards.length,
        replyEditors: replyEditors.length,
        unrepliedHeuristic: unrepliedHeuristic.length,
        collapsedReplyThreads: topComments.filter((item) => item.hasCollapsedReplies).length,
        followupCandidates: topComments.filter((item) => item.replyNeedReason === 'user_followup_after_author_reply').length,
      },
    });
  } catch (err) {
    return JSON.stringify({ok: false, module: 'comment', error: String(err), url: location.href});
  }
})();
"""




def build_comment_same_work_refresh_script(reason: str = "same_work_refresh") -> str:
    import json as _json
    payload = _json.dumps({"reason": str(reason or "same_work_refresh")}, ensure_ascii=False)
    return rf"""
(() => {{
  try {{
    const payload = {payload};
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {{
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && parseFloat(style.opacity || '1') > 0.02
        && rect.width >= 2
        && rect.height >= 2;
    }};
    const fireClick = (el) => {{
      if (!el) return false;
      try {{ el.scrollIntoView({{block: 'center', inline: 'center'}}); }} catch (err) {{}}
      try {{
        const rect = el.getBoundingClientRect();
        const opts = {{bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2}};
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
        return true;
      }} catch (err) {{
        try {{ el.click(); return true; }} catch (err2) {{ return false; }}
      }}
    }};
    const activeEditable = document.activeElement instanceof Element
      && (document.activeElement.matches('[contenteditable="true"], textarea, input')
        || !!document.activeElement.closest('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6'));
    const replyEditorInputs = Array.from(document.querySelectorAll('.reply-content-obcMk0 [contenteditable="true"], .reply-NYBpwz [contenteditable="true"], .wrap-NeUN4f [contenteditable="true"], textarea'))
      .filter((el) => el instanceof Element && visible(el));
    const replyEditors = Array.from(document.querySelectorAll('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6'))
      .filter((el) => el instanceof Element && visible(el));
    const draftTexts = replyEditorInputs
      .map((el) => textOf(el).replace(/^(回复|说点什么|留下你的想法)\s*/g, '').trim())
      .filter(Boolean);
    const hasNonEmptyDraft = draftTexts.some((txt) => txt.length > 0);
    if (activeEditable || replyEditors.length > 0 || replyEditorInputs.length > 0) {{
      if (hasNonEmptyDraft) {{
        return JSON.stringify({{
          ok: false,
          action: 'comment_same_work_refresh',
          state: 'active_editor_with_text',
          reason: payload.reason,
          replyEditors: replyEditors.length,
          replyEditorInputs: replyEditorInputs.length,
          draftPreview: draftTexts.join(' | ').slice(0, 120),
          url: location.href,
        }});
      }}
      let cancelClicked = 0;
      const cancelNodes = [];
      for (const root of replyEditors.concat(replyEditorInputs.map((el) => el.closest('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6')).filter(Boolean))) {{
        for (const node of Array.from(root.querySelectorAll('button, [role="button"], span, div'))) {{
          if (visible(node) && textOf(node) === '取消' && !cancelNodes.includes(node)) cancelNodes.push(node);
        }}
      }}
      for (const node of cancelNodes.slice(0, 4)) {{
        if (fireClick(node)) cancelClicked += 1;
      }}
      try {{
        const ev1 = new KeyboardEvent('keydown', {{bubbles: true, cancelable: true, key: 'Escape', code: 'Escape'}});
        const ev2 = new KeyboardEvent('keyup', {{bubbles: true, cancelable: true, key: 'Escape', code: 'Escape'}});
        document.dispatchEvent(ev1);
        if (document.activeElement instanceof Element) document.activeElement.dispatchEvent(ev1);
        document.dispatchEvent(ev2);
        if (document.activeElement instanceof Element) document.activeElement.dispatchEvent(ev2);
      }} catch (err) {{}}
      try {{ if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }} catch (err) {{}}
      setTimeout(() => {{
        try {{ location.reload(); }} catch (err) {{
          try {{ location.href = location.href; }} catch (err2) {{}}
        }}
      }}, 320);
      return JSON.stringify({{
        ok: true,
        action: 'comment_same_work_refresh',
        state: 'stale_editor_closed_reload_scheduled',
        reason: payload.reason,
        cancelClicked,
        replyEditors: replyEditors.length,
        replyEditorInputs: replyEditorInputs.length,
        url: location.href,
      }});
    }}
    const currentWorkTitle = textOf(document.querySelector('.content-T9PTck .title-iqC0Gj'));
    const currentWorkMeta = textOf(document.querySelector('.content-T9PTck .desc-uISkyj'));
    const topComments = Array.from(document.querySelectorAll('.container-sXKyMs')).filter(visible).length;
    try {{
      document.dispatchEvent(new KeyboardEvent('keydown', {{bubbles: true, cancelable: true, key: 'Escape'}}));
      document.dispatchEvent(new KeyboardEvent('keyup', {{bubbles: true, cancelable: true, key: 'Escape'}}));
    }} catch (err) {{}}
    try {{ if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }} catch (err) {{}}
    setTimeout(() => {{
      try {{ location.reload(); }} catch (err) {{
        try {{ location.href = location.href; }} catch (err2) {{}}
      }}
    }}, 80);
    return JSON.stringify({{
      ok: true,
      action: 'comment_same_work_refresh',
      state: 'reload_scheduled',
      reason: payload.reason,
      currentWorkTitle,
      currentWorkMeta,
      topComments,
      url: location.href,
    }});
  }} catch (err) {{
    return JSON.stringify({{ok: false, action: 'comment_same_work_refresh', state: 'error', error: String(err), url: location.href}});
  }}
}})();
"""


def build_comment_set_filter_script(target_text: str = "未回复") -> str:
    target_text = (target_text or "未回复").replace("\\", "\\\\").replace("\"", "\\\"")
    return rf"""
(() => {{
  try {{
    const targetText = \"{target_text}\";
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {{
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && parseFloat(style.opacity || '1') > 0.02
        && rect.width >= 2
        && rect.height >= 2;
    }};
    const rectOf = (el) => {{
      if (!el || !(el instanceof Element)) return {{x: 0, y: 0, w: 0, h: 0}};
      const r = el.getBoundingClientRect();
      return {{x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}};
    }};
    const pathHint = (el) => {{
      if (!el || !(el instanceof Element)) return '';
      const parts = [];
      let cur = el;
      for (let i = 0; i < 5 && cur; i += 1) {{
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
      }}
      return parts.join(' <- ');
    }};
    const fireClick = (node) => {{
      if (!node || !(node instanceof Element)) return false;
      try {{ node.scrollIntoView({{block: 'center', inline: 'center'}}); }} catch (err) {{}}
      const rect = node.getBoundingClientRect();
      const cx = rect.left + Math.max(4, Math.min(rect.width - 4, rect.width / 2));
      const cy = rect.top + Math.max(4, Math.min(rect.height - 4, rect.height / 2));
      try {{ node.focus({{preventScroll: true}}); }} catch (err) {{ try {{ node.focus(); }} catch (err2) {{}} }}
      ['pointerover', 'mouseover', 'pointerenter', 'mouseenter', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {{
        try {{
          node.dispatchEvent(new MouseEvent(type, {{
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX: cx,
            clientY: cy,
            button: 0,
          }}));
        }} catch (err) {{}}
      }});
      try {{ node.click(); }} catch (err) {{}}
      ['Enter', ' '].forEach((key) => {{
        try {{
          node.dispatchEvent(new KeyboardEvent('keydown', {{bubbles: true, cancelable: true, key}}));
          node.dispatchEvent(new KeyboardEvent('keyup', {{bubbles: true, cancelable: true, key}}));
        }} catch (err) {{}}
      }});
      return true;
    }};
    const settleFilterFocus = () => {{
      const before = {{
        activeTag: document.activeElement ? String(document.activeElement.tagName || '') : '',
        activeText: textOf(document.activeElement).slice(0, 40),
      }};
      try {{
        document.dispatchEvent(new KeyboardEvent('keydown', {{bubbles: true, cancelable: true, key: 'Escape'}}));
        document.dispatchEvent(new KeyboardEvent('keyup', {{bubbles: true, cancelable: true, key: 'Escape'}}));
      }} catch (err) {{}}
      try {{ if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }} catch (err) {{}}
      return before;
    }};
    const operationsRoot = document.querySelector('.operations-o6e97h') || document;
    const controls = Array.from(operationsRoot.querySelectorAll('[role="combobox"], .douyin-creator-interactive-select'))
      .filter((el) => el instanceof Element && visible(el));
    const currentTextOf = (el) => textOf(el.querySelector('.douyin-creator-interactive-select-selection-text') || el);
    const control = controls.find((el) => ['全部评论', '未回复', '包含问题', '可能打扰'].some((label) => currentTextOf(el).includes(label))) || null;
    if (!control) {{
      return JSON.stringify({{ok: false, action: 'set_comment_filter', state: 'filter_control_missing', targetText}});
    }}
    const currentText = currentTextOf(control);
    const expanded = String(control.getAttribute('aria-expanded') || '').toLowerCase() === 'true'
      || (typeof control.className === 'string' && control.className.includes('select-open'));
    const findOption = () => Array.from(document.querySelectorAll('[role="option"], .douyin-creator-interactive-select-option'))
      .find((el) => visible(el) && textOf(el) === targetText) || null;
    if (currentText === targetText && !expanded) {{
      const focusAfterFilter = settleFilterFocus();
      return JSON.stringify({{
        ok: true,
        action: 'set_comment_filter',
        state: 'already_selected',
        targetText,
        currentText,
        focusAfterFilter,
        control: {{rect: rectOf(control), hint: pathHint(control)}},
      }});
    }}
    let optionNode = findOption();
    if (!optionNode) {{
      fireClick(control);
      optionNode = findOption();
    }}
    if (optionNode) {{
      fireClick(optionNode);
      const focusAfterFilter = settleFilterFocus();
      return JSON.stringify({{
        ok: true,
        action: 'set_comment_filter',
        state: 'option_clicked',
        targetText,
        currentText,
        optionText: textOf(optionNode),
        focusAfterFilter,
        control: {{rect: rectOf(control), hint: pathHint(control)}},
        option: {{rect: rectOf(optionNode), hint: pathHint(optionNode)}},
      }});
    }}
    const focusAfterFilter = settleFilterFocus();
    return JSON.stringify({{
      ok: true,
      action: 'set_comment_filter',
      state: expanded ? 'popup_visible_but_option_missing' : 'trigger_clicked',
      targetText,
      currentText,
      expanded: String(control.getAttribute('aria-expanded') || ''),
      ariaControls: control.getAttribute('aria-controls') || '',
      popupId: control.getAttribute('data-popupid') || '',
      focusAfterFilter,
      control: {{rect: rectOf(control), hint: pathHint(control)}},
    }});
  }} catch (err) {{
    return JSON.stringify({{ok: false, action: 'set_comment_filter', state: 'error', error: String(err)}});
  }}
}})();
"""




def build_comment_expand_reply_thread_script(thread_key: str, author: str, content: str) -> str:
    import json as _json
    payload = _json.dumps({"threadKey": thread_key, "author": author, "content": content}, ensure_ascii=False)
    return rf"""
(() => {{
  try {{
    const payload = {payload};
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {{
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.02 && rect.width >= 2 && rect.height >= 2;
    }};
    const rectOf = (el) => {{
      if (!el || !(el instanceof Element)) return {{x: 0, y: 0, w: 0, h: 0}};
      const r = el.getBoundingClientRect();
      return {{x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}};
    }};
    const pathHint = (el) => {{
      if (!el || !(el instanceof Element)) return '';
      const parts = [];
      let cur = el;
      for (let i = 0; i < 5 && cur; i += 1) {{
        let part = (cur.tagName || '').toLowerCase();
        if (!part) break;
        if (cur.id) part += '#' + cur.id;
        const cls = (typeof cur.className === 'string' ? cur.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
        if (cls.length) part += '.' + cls.join('.');
        parts.push(part);
        cur = cur.parentElement;
      }}
      return parts.join(' <- ');
    }};
    const ownText = (el, omitSelectors = []) => {{
      if (!el || !(el instanceof Element)) return '';
      const clone = el.cloneNode(true);
      omitSelectors.forEach((sel) => clone.querySelectorAll(sel).forEach((node) => node.remove()));
      return textOf(clone);
    }};

    const isButtonLike = (el) => {{
      if (!el || !(el instanceof Element)) return false;
      const tag = (el.tagName || '').toLowerCase();
      const role = el.getAttribute('role') || '';
      const style = window.getComputedStyle(el);
      return tag === 'button'
        || tag === 'a'
        || role === 'button'
        || role === 'link'
        || el.hasAttribute('onclick')
        || el.tabIndex >= 0
        || style.cursor === 'pointer'
        || (typeof el.className === 'string' && /(button|btn|trigger|selector|switcher|load-more)/i.test(el.className));
    }};
    const collapsedReplyTextInfo = (text) => {{
      const t = String(text || '').replace(/\s+/g, ' ').trim();
      const exact = /^查看\s*\d+\s*条回复$/.test(t);
      const contains = /查看\s*\d+\s*条回复/.test(t) || (t.includes('查看') && t.includes('条回复'));
      return {{text: t, exact, contains}};
    }};
    const findCollapsedReplyTrigger = (host) => {{
      const scope = (host && host instanceof Element) ? host : document;
      const nodes = Array.from(scope.querySelectorAll('.load-more-pDyh1o, [class*="load-more"], button, [role="button"], a, span, div'))
        .filter((el) => el instanceof Element && visible(el));
      const choices = nodes
        .map((el) => {{
          const info = collapsedReplyTextInfo(textOf(el));
          if (!info.contains) return null;
          const r = el.getBoundingClientRect();
          const className = typeof el.className === 'string' ? el.className : '';
          const tag = (el.tagName || '').toLowerCase();
          const isLoadMoreClass = /load-more/i.test(className);
          const buttonLike = isButtonLike(el) || tag === 'button' || tag === 'a' || isLoadMoreClass;
          const noisyContainer = !info.exact && /回复\s*删除|删除\s*举报|举报/.test(info.text);
          return {{el, text: info.text, exact: info.exact, contains: info.contains, buttonLike, isLoadMoreClass, noisyContainer, textLen: info.text.length, area: Math.round(r.width * r.height)}};
        }})
        .filter(Boolean)
        .filter((x) => x.exact || x.isLoadMoreClass || (x.buttonLike && x.textLen <= 32 && x.area <= 50000))
        .sort((a, b) => (
          (Number(b.exact) - Number(a.exact))
          || (Number(b.isLoadMoreClass) - Number(a.isLoadMoreClass))
          || (Number(b.buttonLike) - Number(a.buttonLike))
          || (Number(a.noisyContainer) - Number(b.noisyContainer))
          || (a.textLen - b.textLen)
          || (a.area - b.area)
        ));
      return choices.length ? choices[0].el : null;
    }};
    const resolveCollapsedReplyClickTarget = (el) => {{
      if (!el || !(el instanceof Element)) return null;
      const exactHost = el.closest('.load-more-pDyh1o, [class*="load-more"], button, [role="button"], a, [tabindex]');
      if (exactHost instanceof Element && visible(exactHost)) return exactHost;
      let cur = el;
      for (let i = 0; i < 4 && cur; i += 1) {{
        if (visible(cur) && isButtonLike(cur)) return cur;
        cur = cur.parentElement;
      }}
      return el;
    }};
    const extractCommentContent = (card, authorText = '', timeText = '') => {{
      if (!card || !(card instanceof Element)) return '';
      const richTextOf = (node) => {{
        if (!node) return '';
        const parts = [];
        const walk = (cur) => {{
          if (!cur) return;
          if (cur.nodeType === Node.TEXT_NODE) {{
            parts.push(cur.textContent || '');
            return;
          }}
          if (!(cur instanceof Element)) return;
          const tag = (cur.tagName || '').toLowerCase();
          if (tag === 'img') {{
            parts.push(cur.getAttribute('alt') || cur.getAttribute('data-type') || cur.getAttribute('title') || cur.getAttribute('aria-label') || '');
            return;
          }}
          if (tag === 'br') {{
            parts.push(' ');
            return;
          }}
          Array.from(cur.childNodes || []).forEach(walk);
        }};
        walk(node);
        return parts.join('').replace(/\s+/g, ' ').trim();
      }};
      const direct = Array.from(card.querySelectorAll('.comment-content-text-JvmAKq, [class*="comment-content-text"], [class*="comment-content"], [class*="content-text"], [class*="commentText"]'))
        .map((node) => richTextOf(node) || textOf(node)).find(Boolean);
      if (direct) return direct.slice(0, 240);
      const clone = card.cloneNode(true);
      clone.querySelectorAll('img').forEach((node) => {{
        const token = node.getAttribute('alt') || node.getAttribute('data-type') || node.getAttribute('title') || node.getAttribute('aria-label') || '';
        try {{ node.replaceWith(document.createTextNode(token)); }} catch (err) {{}}
      }});
      ['.username-aLgaNB', '[class*="username"]', '.tag-DAEcKE', '[class*="tag-"]', '.time-NRtTXO', '[class*="time-"]', '.operations-WFV7Am', '[class*="operation"]', '.reply-list-QwXCb_', '[class*="reply-list"]', '.wrap-NeUN4f', '.footer-oZJTJd', '[contenteditable="true"]', 'textarea', 'button'].forEach((sel) => clone.querySelectorAll(sel).forEach((node) => node.remove()));
      let text = richTextOf(clone) || textOf(clone);
      [authorText, timeText, '回复', '点赞', '取消', '发送'].filter(Boolean).forEach((token) => {{ text = text.replace(token, ' '); }});
      return text.replace(/\s+/g, ' ').trim().slice(0, 240);
    }};
    const fireClick = (node) => {{
      if (!node || !(node instanceof Element)) return false;
      try {{ node.scrollIntoView({{block: 'center', inline: 'nearest'}}); }} catch (err) {{}}
      const rect = node.getBoundingClientRect();
      const cx = rect.left + Math.max(3, Math.min(Math.max(3, rect.width - 3), rect.width / 2));
      const cy = rect.top + Math.max(3, Math.min(Math.max(3, rect.height - 3), rect.height / 2));
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {{
        try {{ node.dispatchEvent(new MouseEvent(type, {{bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, button: 0}})); }} catch (err) {{}}
      }});
      try {{ node.click(); }} catch (err) {{}}
      return true;
    }};
    const cards = Array.from(document.querySelectorAll('.container-sXKyMs'))
      .filter((card) => visible(card) && !card.closest('.reply-list-QwXCb_'))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const cardBand = (card) => {{
      const index = cards.indexOf(card);
      const rect = card.getBoundingClientRect();
      const next = index >= 0 ? cards[index + 1] : null;
      const nextRect = next ? next.getBoundingClientRect() : null;
      return {{index, top: rect.top - 2, bottom: nextRect ? (nextRect.top - 2) : Number.POSITIVE_INFINITY}};
    }};
    const nodeInBand = (node, band) => {{
      if (!node || !(node instanceof Element) || !band) return false;
      const r = node.getBoundingClientRect();
      const y = r.top + Math.min(Math.max(r.height / 2, 1), 12);
      return y >= band.top && y < band.bottom;
    }};
    const findCollapsedReplyTriggerInBand = (card, host) => {{
      const band = cardBand(card);
      const localNodes = Array.from(((host && host instanceof Element) ? host : document).querySelectorAll('.load-more-pDyh1o, [class*="load-more"], button, [role="button"], a, span, div'));
      const globalNodes = Array.from(document.querySelectorAll('.load-more-pDyh1o, [class*="load-more"], button, [role="button"], a, span, div'));
      const seen = new Set();
      const nodes = [];
      for (const el of [...localNodes, ...globalNodes]) {{
        if (!(el instanceof Element) || seen.has(el) || !visible(el) || !nodeInBand(el, band)) continue;
        seen.add(el);
        nodes.push(el);
      }}
      const choices = nodes
        .map((el) => {{
          const info = collapsedReplyTextInfo(textOf(el));
          if (!info.contains) return null;
          const r = el.getBoundingClientRect();
          const className = typeof el.className === 'string' ? el.className : '';
          const tag = (el.tagName || '').toLowerCase();
          const isLoadMoreClass = /load-more/i.test(className);
          const buttonLike = isButtonLike(el) || tag === 'button' || tag === 'a' || isLoadMoreClass;
          const noisyContainer = !info.exact && /回复\s*删除|删除\s*举报|举报/.test(info.text);
          return {{el, text: info.text, exact: info.exact, buttonLike, isLoadMoreClass, noisyContainer, textLen: info.text.length, area: Math.round(r.width * r.height)}};
        }})
        .filter(Boolean)
        .filter((x) => x.exact || x.isLoadMoreClass || (x.buttonLike && x.textLen <= 32 && x.area <= 50000))
        .sort((a, b) => (
          (Number(b.exact) - Number(a.exact))
          || (Number(b.isLoadMoreClass) - Number(a.isLoadMoreClass))
          || (Number(b.buttonLike) - Number(a.buttonLike))
          || (Number(a.noisyContainer) - Number(b.noisyContainer))
          || (a.textLen - b.textLen)
          || (a.area - b.area)
        ));
      return choices.length ? choices[0].el : null;
    }};
    const findThreadHost = (card) => {{
      let cur = card && card.parentElement ? card.parentElement : card;
      for (let i = 0; i < 4 && cur; i += 1) {{
        const directTopCount = Array.from(cur.querySelectorAll('.container-sXKyMs')).filter((node) => !node.closest('.reply-list-QwXCb_')).length;
        if ((cur.querySelector('.reply-list-QwXCb_') || textOf(cur).includes('查看')) && directTopCount <= 1) return cur;
        cur = cur.parentElement;
      }}
      return (card && card.parentElement) || card;
    }};
    const mapped = cards.map((card, index) => {{
      const authorNode = card.querySelector('.username-aLgaNB');
      const timeNode = card.querySelector('.time-NRtTXO');
      const authorName = ownText(authorNode, ['.tag-DAEcKE']);
      const timeText = textOf(timeNode);
      const contentText = extractCommentContent(card, authorName, timeText).slice(0, 200);
      const threadKey = [authorName, timeText, contentText.slice(0, 80)].join(' | ');
      const threadHost = findThreadHost(card);
      const loadMore = findCollapsedReplyTriggerInBand(card, threadHost);
      const loadMoreText = textOf(loadMore);
      const loadMoreInfo = collapsedReplyTextInfo(loadMoreText);
      return {{index, card, threadHost, threadKey, author: authorName, timeText, content: contentText, loadMore, loadMoreText, loadMoreExact: !!loadMoreInfo.exact, loadMoreHint: loadMore ? pathHint(loadMore) : '', loadMoreRect: loadMore ? rectOf(loadMore) : {{x: 0, y: 0, w: 0, h: 0}}}};
    }});
    let selectedBy = '';
    let candidate = mapped.find((item) => payload.threadKey && item.threadKey === payload.threadKey) || null;
    if (candidate) selectedBy = 'threadKey';
    if (!candidate) {{ candidate = mapped.find((item) => item.author === payload.author && payload.content && item.content === payload.content) || null; if (candidate) selectedBy = 'author_content'; }}
    if (!candidate) {{
      const authorMatches = mapped.filter((item) => item.author === payload.author);
      if (authorMatches.length === 1) {{ candidate = authorMatches[0]; selectedBy = 'author_only_unique'; }}
    }}
    if (!candidate) {{
      return JSON.stringify({{ok: false, action: 'expand_comment_replies', state: 'candidate_missing', payload, selectedBy, mapped: mapped.map((item) => ({{index: item.index, threadKey: item.threadKey, author: item.author, timeText: item.timeText, content: item.content, loadMoreText: item.loadMoreText}})).slice(0, 10)}});
    }}
    if (!candidate.loadMore) {{
      return JSON.stringify({{ok: false, action: 'expand_comment_replies', state: 'load_more_missing', payload, selectedBy, target: {{threadKey: candidate.threadKey, author: candidate.author, content: candidate.content, loadMoreText: candidate.loadMoreText, rect: rectOf(candidate.card), hint: pathHint(candidate.card)}}}});
    }}
    const beforeText = candidate.loadMoreText;
    const clickTarget = resolveCollapsedReplyClickTarget(candidate.loadMore);
    const clicked = fireClick(clickTarget);
    return JSON.stringify({{ok: clicked, action: 'expand_comment_replies', state: clicked ? 'clicked' : 'click_failed', payload, selectedBy, target: {{threadKey: candidate.threadKey, author: candidate.author, content: candidate.content, beforeText, loadMoreExact: !!candidate.loadMoreExact, sourceLoadMoreRect: candidate.loadMoreRect, sourceLoadMoreHint: candidate.loadMoreHint, loadMoreRect: rectOf(clickTarget), loadMoreHint: pathHint(clickTarget), cardRect: rectOf(candidate.card), cardHint: pathHint(candidate.card)}}}});
  }} catch (err) {{
    return JSON.stringify({{ok: false, action: 'expand_comment_replies', state: 'error', error: String(err)}});
  }}
}})();
"""


def build_comment_scroll_scan_script(direction: str = "down") -> str:
    import json as _json
    payload = _json.dumps({"direction": str(direction or "down")}, ensure_ascii=False)
    return rf"""
(() => {{
  const payload = {payload};
  const textOf = (node) => (node && (node.innerText || node.textContent || '') || '').replace(/\s+/g, ' ').trim();
  const rectOf = (node) => {{
    if (!node || !node.getBoundingClientRect) return {{x: 0, y: 0, w: 0, h: 0}};
    const r = node.getBoundingClientRect();
    return {{x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}};
  }};
  const pathHint = (node) => {{
    if (!node || !node.tagName) return '';
    const parts = [];
    let cur = node;
    for (let i = 0; i < 5 && cur && cur.tagName; i += 1, cur = cur.parentElement) {{
      const cls = typeof cur.className === 'string' && cur.className ? '.' + cur.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
      parts.push((cur.tagName || '').toLowerCase() + cls);
    }}
    return parts.join(' <- ');
  }};
  const visible = (el) => {{
    if (!el || !(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }};
  const uniqBy = (arr, fn) => {{
    const seen = new Set();
    const out = [];
    for (const item of arr) {{
      const key = fn(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }}
    return out;
  }};
  const describe = (node) => {{
    const isDoc = node === document.scrollingElement || node === document.documentElement || node === document.body;
    const el = isDoc ? (document.scrollingElement || document.documentElement || document.body) : node;
    if (!el) return {{found: false}};
    const scrollTop = Number(el.scrollTop || 0);
    const clientHeight = Number(el.clientHeight || window.innerHeight || 0);
    const scrollHeight = Number(el.scrollHeight || 0);
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
    return {{
      found: true,
      isDocument: !!isDoc,
      tag: isDoc ? 'document' : ((el.tagName || '').toLowerCase()),
      className: (!isDoc && typeof el.className === 'string') ? el.className.slice(0, 160) : '',
      hint: isDoc ? 'document.scrollingElement' : pathHint(el),
      scrollTop: Math.round(scrollTop),
      clientHeight: Math.round(clientHeight),
      scrollHeight: Math.round(scrollHeight),
      maxScrollTop: Math.round(maxScrollTop),
      canScrollDown: maxScrollTop - scrollTop > Math.max(24, clientHeight * 0.08),
      atBottom: maxScrollTop - scrollTop <= Math.max(24, clientHeight * 0.08),
      rect: isDoc ? {{x: 0, y: 0, w: Math.round(window.innerWidth || 0), h: Math.round(window.innerHeight || 0)}} : rectOf(el),
    }};
  }};
  const topCards = Array.from(document.querySelectorAll('.container-sXKyMs')).filter(visible);
  const root = document.querySelector('.container-AFENbv') || document.body;
  const listContainer = topCards.length ? (topCards[0].parentElement?.parentElement || topCards[0].parentElement || null) : (document.querySelector('.container-Pr4RHc') || root || null);
  const candidates = [];
  let cur = listContainer || root || document.body;
  for (let i = 0; i < 8 && cur; i += 1) {{
    candidates.push(cur);
    cur = cur.parentElement;
  }}
  candidates.push(
    document.querySelector('.container-Pr4RHc'),
    document.querySelector('.container-AFENbv'),
    document.scrollingElement,
    document.documentElement,
    document.body,
  );
  const uniq = uniqBy(candidates.filter(Boolean), (el) => el);
  const scrollable = uniq
    .map((el) => ({{el, info: describe(el)}}))
    .filter((x) => x.info.found && x.info.scrollHeight > x.info.clientHeight + 32)
    .sort((a, b) => {{
      const aContains = topCards[0] && a.el instanceof Element && a.el.contains(topCards[0]);
      const bContains = topCards[0] && b.el instanceof Element && b.el.contains(topCards[0]);
      return (Number(bContains) - Number(aContains)) || ((a.info.scrollHeight - a.info.clientHeight) - (b.info.scrollHeight - b.info.clientHeight));
    }});
  const chosen = scrollable.length ? scrollable[0].el : (document.scrollingElement || document.documentElement || document.body);
  const before = describe(chosen);
  if (!before.found || !before.canScrollDown) {{
    return JSON.stringify({{ok: false, action: 'comment_scan_scroll', state: 'not_scrollable', direction: payload.direction || 'down', before}});
  }}
  const el = (chosen === document.scrollingElement || chosen === document.documentElement || chosen === document.body)
    ? (document.scrollingElement || document.documentElement || document.body)
    : chosen;
  const step = Math.max(240, Math.floor((before.clientHeight || window.innerHeight || 800) * 0.72));
  const nextTop = Math.min(before.maxScrollTop, before.scrollTop + step);
  try {{ el.scrollTo({{top: nextTop, behavior: 'instant'}}); }} catch (err) {{ el.scrollTop = nextTop; }}
  try {{ window.dispatchEvent(new Event('scroll')); }} catch (err) {{}}
  const after = describe(chosen);
  return JSON.stringify({{
    ok: after.scrollTop > before.scrollTop + 8,
    action: 'comment_scan_scroll',
    state: after.scrollTop > before.scrollTop + 8 ? 'scrolled' : 'no_movement',
    direction: payload.direction || 'down',
    before,
    after,
    visibleTopSamples: topCards.slice(0, 3).map((card) => textOf(card).slice(0, 80)),
  }});
}})();
"""


def build_comment_open_workdrawer_script() -> str:
    return r"""
(() => {
  try {
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && parseFloat(style.opacity || '1') > 0.02
        && rect.width >= 2
        && rect.height >= 2;
    };
    const rectOf = (el) => {
      if (!el || !(el instanceof Element)) return {x: 0, y: 0, w: 0, h: 0};
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
    const isButtonLike = (el) => {
      if (!el || !(el instanceof Element)) return false;
      const tag = (el.tagName || '').toLowerCase();
      const role = el.getAttribute('role') || '';
      const style = window.getComputedStyle(el);
      return tag === 'button'
        || role === 'button'
        || role === 'link'
        || el.hasAttribute('onclick')
        || el.tabIndex >= 0
        || style.cursor === 'pointer'
        || (typeof el.className === 'string' && /(button|btn|trigger|selector|switcher)/i.test(el.className));
    };
    const resolveTargetChain = (source) => {
      if (!source || !(source instanceof Element)) return [];
      const rect = source.getBoundingClientRect();
      const cx = rect.left + Math.max(4, Math.min(rect.width - 4, rect.width / 2));
      const cy = rect.top + Math.max(4, Math.min(rect.height - 4, rect.height / 2));
      const centerNode = document.elementFromPoint(cx, cy);
      const chain = [
        source,
        source.closest('button'),
        source.closest('[role="button"]'),
        source.closest('.douyin-creator-interactive-button'),
        source.closest('.semi-button'),
        centerNode,
        centerNode && centerNode.closest ? centerNode.closest('button') : null,
        centerNode && centerNode.closest ? centerNode.closest('[role="button"]') : null,
        centerNode && centerNode.closest ? centerNode.closest('.douyin-creator-interactive-button') : null,
      ].filter(Boolean);
      const out = [];
      const seen = new Set();
      for (const node of chain) {
        if (!(node instanceof Element)) continue;
        if (seen.has(node)) continue;
        seen.add(node);
        if (!visible(node)) continue;
        out.push(node);
      }
      return out.sort((a, b) => {
        const aBtn = isButtonLike(a) ? 1 : 0;
        const bBtn = isButtonLike(b) ? 1 : 0;
        if (aBtn !== bBtn) return bBtn - aBtn;
        const ar = rectOf(a);
        const br = rectOf(b);
        return (ar.w * ar.h) - (br.w * br.h);
      });
    };
    const fireClick = (node) => {
      if (!node || !(node instanceof Element)) return false;
      try { node.scrollIntoView({block: 'center', inline: 'center'}); } catch (err) {}
      const rect = node.getBoundingClientRect();
      const cx = rect.left + Math.max(4, Math.min(rect.width - 4, rect.width / 2));
      const cy = rect.top + Math.max(4, Math.min(rect.height - 4, rect.height / 2));
      try { node.focus({preventScroll: true}); } catch (err) { try { node.focus(); } catch (err2) {} }
      const mouseTypes = ['pointerover', 'mouseover', 'pointerenter', 'mouseenter', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
      mouseTypes.forEach((type) => {
        try {
          const evt = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX: cx,
            clientY: cy,
            button: 0,
          });
          node.dispatchEvent(evt);
        } catch (err) {}
      });
      try { node.click(); } catch (err) {}
      ['Enter', ' '].forEach((key) => {
        try {
          node.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, cancelable: true, key}));
          node.dispatchEvent(new KeyboardEvent('keyup', {bubbles: true, cancelable: true, key}));
        } catch (err) {}
      });
      return true;
    };

    const sources = Array.from(document.querySelectorAll('button, [role="button"], span, div'))
      .filter((el) => visible(el) && textOf(el) === '选择作品');
    if (!sources.length) {
      return JSON.stringify({ok: false, action: 'open_comment_workdrawer', state: 'selector_missing'});
    }

    const attempts = [];
    const seen = new Set();
    for (const source of sources) {
      for (const target of resolveTargetChain(source)) {
        if (seen.has(target)) continue;
        seen.add(target);
        fireClick(target);
        attempts.push({
          tag: (target.tagName || '').toLowerCase(),
          text: textOf(target),
          rect: rectOf(target),
          hint: pathHint(target),
          buttonLike: isButtonLike(target),
        });
        if (attempts.length >= 6) break;
      }
      if (attempts.length >= 6) break;
    }

    return JSON.stringify({
      ok: attempts.length > 0,
      action: 'open_comment_workdrawer',
      state: attempts.length > 0 ? 'clicked' : 'no_target',
      attempts,
    });
  } catch (err) {
    return JSON.stringify({ok: false, action: 'open_comment_workdrawer', state: 'error', error: String(err)});
  }
})();
"""



def build_comment_close_workdrawer_script() -> str:
    return r"""
(() => {
  try {
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && parseFloat(style.opacity || '1') > 0.02
        && rect.width >= 2
        && rect.height >= 2;
    };
    const rectOf = (el) => {
      if (!el || !(el instanceof Element)) return {x: 0, y: 0, w: 0, h: 0};
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
    const fireClick = (node) => {
      if (!node || !(node instanceof Element)) return false;
      try { node.scrollIntoView({block: 'center', inline: 'center'}); } catch (err) {}
      const rect = node.getBoundingClientRect();
      const cx = rect.left + Math.max(4, Math.min(rect.width - 4, rect.width / 2));
      const cy = rect.top + Math.max(4, Math.min(rect.height - 4, rect.height / 2));
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
        try {
          node.dispatchEvent(new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX: cx,
            clientY: cy,
            button: 0,
          }));
        } catch (err) {}
      });
      try { node.click(); } catch (err) {}
      return true;
    };

    const drawerRoot = Array.from(document.querySelectorAll(
      '.douyin-creator-interactive-sidesheet, .douyin-creator-interactive-portal, [class*="sidesheet"], [class*="drawer"], [class*="portal"]'
    )).find((el) => visible(el) && (textOf(el).includes('作品列表') || textOf(el).includes('个视频'))) || null;
    if (!drawerRoot) {
      return JSON.stringify({ok: false, action: 'close_comment_workdrawer', state: 'drawer_missing'});
    }

    const attempts = [];
    const closeCandidates = Array.from(drawerRoot.querySelectorAll('button, [role="button"], span, div, i, svg'))
      .filter((el) => visible(el))
      .filter((el) => {
        const txt = textOf(el);
        const cls = typeof el.className === 'string' ? el.className : '';
        const aria = (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '');
        return txt === '关闭'
          || /close|dismiss|cancel|icon-close|semi-icon-close/i.test(cls)
          || /关闭|close/i.test(aria);
      });

    for (const node of closeCandidates.slice(0, 6)) {
      fireClick(node);
      attempts.push({tag: (node.tagName || '').toLowerCase(), text: textOf(node), rect: rectOf(node), hint: pathHint(node), via: 'close_button'});
    }

    if (!attempts.length) {
      try {
        document.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, cancelable: true, key: 'Escape', code: 'Escape'}));
        document.dispatchEvent(new KeyboardEvent('keyup', {bubbles: true, cancelable: true, key: 'Escape', code: 'Escape'}));
        attempts.push({tag: 'document', text: '', rect: {x: 0, y: 0, w: 0, h: 0}, hint: 'document', via: 'escape'});
      } catch (err) {}
    }

    if (attempts.length <= 1) {
      const rect = drawerRoot.getBoundingClientRect();
      const overlayPoints = [
        {x: Math.max(8, rect.left - 24), y: Math.max(8, rect.top + 24)},
        {x: Math.max(8, rect.left - 24), y: Math.max(8, rect.top + rect.height / 2)},
      ];
      for (const pt of overlayPoints) {
        const node = document.elementFromPoint(pt.x, pt.y);
        if (!node || drawerRoot.contains(node)) continue;
        try {
          node.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true, composed: true, view: window, clientX: pt.x, clientY: pt.y, button: 0}));
          node.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, cancelable: true, composed: true, view: window, clientX: pt.x, clientY: pt.y, button: 0}));
          node.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, composed: true, view: window, clientX: pt.x, clientY: pt.y, button: 0}));
          attempts.push({tag: (node.tagName || '').toLowerCase(), text: textOf(node), rect: rectOf(node), hint: pathHint(node), via: 'overlay_click'});
          break;
        } catch (err) {}
      }
    }

    return JSON.stringify({
      ok: attempts.length > 0,
      action: 'close_comment_workdrawer',
      state: attempts.length > 0 ? 'dismiss_attempted' : 'dismiss_missing',
      drawerRect: rectOf(drawerRoot),
      drawerHint: pathHint(drawerRoot),
      attempts,
    });
  } catch (err) {
    return JSON.stringify({ok: false, action: 'close_comment_workdrawer', state: 'error', error: String(err)});
  }
})();
"""



def build_comment_switch_work_script(target_title: str, target_time_text: str, target_index: int) -> str:
    import json as _json
    payload = _json.dumps({"targetTitle": target_title, "targetTimeText": target_time_text, "targetIndex": target_index}, ensure_ascii=False)
    return rf"""
(() => {{
  try {{
    const payload = {payload};
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {{
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && parseFloat(style.opacity || '1') > 0.02
        && rect.width >= 2
        && rect.height >= 2;
    }};
    const rectOf = (el) => {{
      if (!el || !(el instanceof Element)) return {{x: 0, y: 0, w: 0, h: 0}};
      const r = el.getBoundingClientRect();
      return {{x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}};
    }};
    const pathHint = (el) => {{
      if (!el || !(el instanceof Element)) return '';
      const parts = [];
      let cur = el;
      for (let i = 0; i < 5 && cur; i += 1) {{
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
      }}
      return parts.join(' <- ');
    }};
    const fireClick = (node) => {{
      if (!node || !(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      const cx = rect.left + Math.max(4, Math.min(rect.width - 4, rect.width / 2));
      const cy = rect.top + Math.max(4, Math.min(rect.height - 4, rect.height / 2));
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {{
        const evt = new MouseEvent(type, {{
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          clientX: cx,
          clientY: cy,
          button: 0,
        }});
        node.dispatchEvent(evt);
      }});
      if (typeof node.click === 'function') {{
        try {{ node.click(); }} catch (err) {{}}
      }}
      return true;
    }};

    const drawerRoot = Array.from(document.querySelectorAll(
      '.douyin-creator-interactive-sidesheet, .douyin-creator-interactive-portal, [class*="sidesheet"], [class*="drawer"], [class*="portal"]'
    )).find((el) => visible(el) && (textOf(el).includes('作品列表') || textOf(el).includes('个视频'))) || null;
    if (!drawerRoot) {{
      return JSON.stringify({{ok: false, action: 'switch_comment_work', state: 'drawer_missing', payload}});
    }}

    const candidates = Array.from(drawerRoot.querySelectorAll('.container-Lkxos9, [class*="container-Lkxos9"], [class*="item"]'))
      .filter((el) => visible(el))
      .map((el, domIndex) => {{
        const titleNode = el.querySelector('.title-LUOP3b, [class*="title-"]');
        const timeNode = el.querySelector('.time-UjQLwk, [class*="time-"]');
        const title = textOf(titleNode);
        const timeText = textOf(timeNode);
        const active = (typeof el.className === 'string' ? el.className : '').includes('active-');
        return {{el, domIndex, title, timeText, active, rect: rectOf(el), hint: pathHint(el)}};
      }})
      .filter((item) => item.title || item.timeText);

    const target = candidates.find((item) => !item.active && item.title === payload.targetTitle && item.timeText === payload.targetTimeText)
      || candidates.find((item) => !item.active && item.title === payload.targetTitle)
      || candidates.find((item) => !item.active && item.domIndex === payload.targetIndex)
      || null;

    if (!target) {{
      return JSON.stringify({{ok: false, action: 'switch_comment_work', state: 'target_missing', payload, candidates: candidates.map((item) => ({{domIndex: item.domIndex, title: item.title, timeText: item.timeText, active: item.active}})).slice(0, 10)}});
    }}

    fireClick(target.el);
    return JSON.stringify({{
      ok: true,
      action: 'switch_comment_work',
      state: 'clicked',
      payload,
      target: {{domIndex: target.domIndex, title: target.title, timeText: target.timeText, active: target.active, rect: target.rect, hint: target.hint}},
    }});
  }} catch (err) {{
    return JSON.stringify({{ok: false, action: 'switch_comment_work', state: 'error', error: String(err)}});
  }}
}})();
"""




def build_comment_prepare_reply_click_script(thread_key: str, author: str, content: str) -> str:
    import json as _json
    payload = _json.dumps({"threadKey": thread_key, "author": author, "content": content}, ensure_ascii=False)
    return rf"""
(() => {{
  try {{
    const payload = {payload};
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {{
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.02 && rect.width >= 2 && rect.height >= 2;
    }};
    const rectOf = (el) => {{
      if (!el || !(el instanceof Element)) return {{x: 0, y: 0, w: 0, h: 0}};
      const r = el.getBoundingClientRect();
      return {{x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}};
    }};
    const pathHint = (el) => {{
      if (!el || !(el instanceof Element)) return '';
      const parts = [];
      let cur = el;
      for (let i = 0; i < 5 && cur; i += 1) {{
        let part = (cur.tagName || '').toLowerCase();
        if (!part) break;
        if (cur.id) part += '#' + cur.id;
        const cls = (typeof cur.className === 'string' ? cur.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
        if (cls.length) part += '.' + cls.join('.');
        parts.push(part);
        cur = cur.parentElement;
      }}
      return parts.join(' <- ');
    }};
    const activeBefore = document.activeElement instanceof Element ? document.activeElement : null;
    const openSelectsBefore = Array.from(document.querySelectorAll('.douyin-creator-interactive-select-open')).filter(visible);
    const visiblePopoversBefore = Array.from(document.querySelectorAll('.douyin-creator-interactive-popover, [class*="popover"], [class*="dropdown"]'))
      .filter((el) => visible(el)).map((el) => textOf(el).slice(0, 120)).filter(Boolean).slice(0, 6);
    try {{
      const ev1 = new KeyboardEvent('keydown', {{bubbles: true, cancelable: true, key: 'Escape', code: 'Escape'}});
      const ev2 = new KeyboardEvent('keyup', {{bubbles: true, cancelable: true, key: 'Escape', code: 'Escape'}});
      document.dispatchEvent(ev1);
      if (activeBefore) activeBefore.dispatchEvent(ev1);
      document.dispatchEvent(ev2);
      if (activeBefore) activeBefore.dispatchEvent(ev2);
    }} catch (err) {{}}
    try {{ if (activeBefore && activeBefore.blur) activeBefore.blur(); }} catch (err) {{}}
    try {{ if (document.body && document.body.focus) document.body.focus({{preventScroll: true}}); }} catch (err) {{}}
    const activeAfter = document.activeElement instanceof Element ? document.activeElement : null;
    const openSelectsAfter = Array.from(document.querySelectorAll('.douyin-creator-interactive-select-open')).filter(visible);
    const visiblePopoversAfter = Array.from(document.querySelectorAll('.douyin-creator-interactive-popover, [class*="popover"], [class*="dropdown"]'))
      .filter((el) => visible(el)).map((el) => textOf(el).slice(0, 120)).filter(Boolean).slice(0, 6);
    return JSON.stringify({{
      ok: true,
      action: 'prepare_comment_reply_click',
      state: 'focus_residue_prepared',
      payload,
      activeBefore: {{tag: activeBefore ? activeBefore.tagName : '', text: textOf(activeBefore).slice(0, 80), rect: rectOf(activeBefore), hint: pathHint(activeBefore)}},
      activeAfter: {{tag: activeAfter ? activeAfter.tagName : '', text: textOf(activeAfter).slice(0, 80), rect: rectOf(activeAfter), hint: pathHint(activeAfter)}},
      openSelectCountBefore: openSelectsBefore.length,
      openSelectCountAfter: openSelectsAfter.length,
      visiblePopoversBefore,
      visiblePopoversAfter,
      decision: 'defer_real_reply_click_to_next_timer_tick'
    }});
  }} catch (err) {{
    return JSON.stringify({{ok: false, action: 'prepare_comment_reply_click', state: 'error', error: String(err)}});
  }}
}})();
"""

def build_comment_open_reply_editor_script(
    thread_key: str,
    author: str,
    content: str,
    open_method: str = "dom_click_current",
    *,
    target_level: str = "",
    target_index: int = -999,
    target_message_key: str = "",
    reply_dom_key: str = "",
    time_text: str = "",
) -> str:
    import json as _json
    payload = _json.dumps({
        "threadKey": thread_key,
        "author": author,
        "content": content,
        "openMethod": open_method,
        "targetLevel": target_level,
        "targetIndex": target_index,
        "targetMessageKey": target_message_key,
        "replyDomKey": reply_dom_key,
        "timeText": time_text,
    }, ensure_ascii=False)
    return rf"""
(() => {{
  try {{
    const payload = {payload};
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {{
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.02 && rect.width >= 2 && rect.height >= 2;
    }};
    const rectOf = (el) => {{
      if (!el || !(el instanceof Element)) return {{x: 0, y: 0, w: 0, h: 0}};
      const r = el.getBoundingClientRect();
      return {{x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}};
    }};
    const pathHint = (el) => {{
      if (!el || !(el instanceof Element)) return '';
      const parts = [];
      let cur = el;
      for (let i = 0; i < 5 && cur; i += 1) {{
        let part = (cur.tagName || '').toLowerCase();
        if (!part) break;
        if (cur.id) part += '#' + cur.id;
        const cls = (typeof cur.className === 'string' ? cur.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
        if (cls.length) part += '.' + cls.join('.');
        parts.push(part);
        cur = cur.parentElement;
      }}
      return parts.join(' <- ');
    }};
    const ownText = (el, omitSelectors = []) => {{
      if (!el || !(el instanceof Element)) return '';
      const clone = el.cloneNode(true);
      omitSelectors.forEach((sel) => clone.querySelectorAll(sel).forEach((node) => node.remove()));
      return textOf(clone);
    }};
    const extractCommentContent = (card, authorText = '', timeText = '') => {{
      if (!card || !(card instanceof Element)) return '';
      const richTextOf = (node) => {{
        if (!node) return '';
        const parts = [];
        const walk = (cur) => {{
          if (!cur) return;
          if (cur.nodeType === Node.TEXT_NODE) {{
            parts.push(cur.textContent || '');
            return;
          }}
          if (!(cur instanceof Element)) return;
          const tag = (cur.tagName || '').toLowerCase();
          if (tag === 'img') {{
            parts.push(cur.getAttribute('alt') || cur.getAttribute('data-type') || cur.getAttribute('title') || cur.getAttribute('aria-label') || '');
            return;
          }}
          if (tag === 'br') {{
            parts.push(' ');
            return;
          }}
          Array.from(cur.childNodes || []).forEach(walk);
        }};
        walk(node);
        return parts.join('').replace(/\s+/g, ' ').trim();
      }};
      const direct = Array.from(card.querySelectorAll('.comment-content-text-JvmAKq, [class*="comment-content-text"], [class*="comment-content"], [class*="content-text"], [class*="commentText"]'))
        .map((node) => richTextOf(node) || textOf(node))
        .find(Boolean);
      if (direct) return direct.slice(0, 240);
      const clone = card.cloneNode(true);
      clone.querySelectorAll('img').forEach((node) => {{
        const token = node.getAttribute('alt') || node.getAttribute('data-type') || node.getAttribute('title') || node.getAttribute('aria-label') || '';
        try {{
          node.replaceWith(document.createTextNode(token));
        }} catch (err) {{}}
      }});
      [
        '.username-aLgaNB', '[class*="username"]', '.tag-DAEcKE', '[class*="tag-"]',
        '.time-NRtTXO', '[class*="time-"]', '.operations-WFV7Am', '[class*="operation"]',
        '.reply-list-QwXCb_', '[class*="reply-list"]', '.reply-content-obcMk0', '.reply-NYBpwz',
        '.wrap-NeUN4f', '.footer-oZJTJd', '[contenteditable="true"]', 'textarea', 'button',
        '.douyin-creator-interactive-popover', '.douyin-creator-interactive-select',
      ].forEach((sel) => clone.querySelectorAll(sel).forEach((node) => node.remove()));
      let text = richTextOf(clone) || textOf(clone);
      [authorText, timeText, '回复', '点赞', '取消', '发送'].filter(Boolean).forEach((token) => {{
        text = text.replace(token, ' ');
      }});
      return text.replace(/\s+/g, ' ').trim().slice(0, 240);
    }};
    const clickReport = (node, method) => {{
      const report = {{method, fired: false, error: '', targetRect: rectOf(node), targetHint: pathHint(node)}};
      if (!node || !(node instanceof Element)) {{
        report.error = 'invalid_node';
        return report;
      }}
      try {{ node.scrollIntoView({{block: 'center', inline: 'center'}}); }} catch (err) {{}}
      const rect = node.getBoundingClientRect();
      const cx = rect.left + Math.max(3, Math.min(Math.max(3, rect.width - 3), rect.width / 2));
      const cy = rect.top + Math.max(3, Math.min(Math.max(3, rect.height - 3), rect.height / 2));
      const pointBefore = document.elementFromPoint(cx, cy);
      report.clickPoint = {{x: Math.round(cx), y: Math.round(cy)}};
      report.elementFromPointBefore = {{
        text: textOf(pointBefore).slice(0, 80),
        rect: rectOf(pointBefore),
        hint: pathHint(pointBefore),
        insideTarget: !!(pointBefore && (pointBefore === node || node.contains(pointBefore)))
      }};
      const mouse = (type, target = node, x = cx, y = cy) => {{
        target.dispatchEvent(new MouseEvent(type, {{bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0}}));
      }};
      const pointer = (type, target = node, x = cx, y = cy) => {{
        try {{
          target.dispatchEvent(new PointerEvent(type, {{bubbles: true, cancelable: true, composed: true, pointerType: 'mouse', pointerId: 1, isPrimary: true, view: window, clientX: x, clientY: y, button: 0}}));
        }} catch (err) {{
          mouse(type.replace('pointer', 'mouse'), target, x, y);
        }}
      }};
      try {{
        if (method === 'precise_dom_registered_click' || method === 'precise_dom_reacquire_click' || method === 'precise_dom_action_click') {{
          try {{ node.focus?.({{preventScroll: true}}); }} catch (_) {{}}
          report.domRole = node.hasAttribute('data-ucp-reply-action-key')
            ? 'reply_action'
            : (node.hasAttribute('data-ucp-reply-label-key') ? 'reply_label' : 'validated_reply_node');
          report.domKey = node.getAttribute('data-ucp-reply-action-key') || node.getAttribute('data-ucp-reply-label-key') || '';
          // D9: one complete pointer/mouse activation on the exact reply action.
          // This remains one logical click, but includes the event sequence Douyin's
          // delegated handlers may require. Never call node.click() afterwards.
          try {{ pointer('pointerover'); }} catch (_) {{}}
          try {{ mouse('mouseover'); }} catch (_) {{}}
          pointer('pointerdown');
          mouse('mousedown');
          pointer('pointerup');
          mouse('mouseup');
          mouse('click');
          report.preciseDomClick = true;
          report.activationSequence = 'pointer_mouse_single_click';
          report.fired = true;
          return report;
        }} else if (method === 'qt_view_mouse_click') {{
          // Python/Qt side will perform a real view-level mouse click at this coordinate.
          // Keep JS side to location only, so we can diagnose whether native app-level input
          // opens editors when synthetic DOM events do not.
          report.fired = false;
          report.qtClickRequested = true;
          return report;
        }} else if (method === 'native_click') {{
          node.click();
        }} else if (method === 'hover_then_native_click') {{
          // Some nested reply rows only bind after the row has received hover/move.
          const card = node.closest('.container-sXKyMs') || node;
          ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'mousemove'].forEach((type) => {{
            try {{
              if (type.startsWith('pointer')) pointer(type, card);
              else mouse(type, card);
            }} catch (err) {{}}
          }});
          ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'mousemove'].forEach((type) => {{
            try {{
              if (type.startsWith('pointer')) pointer(type, node);
              else mouse(type, node);
            }} catch (err) {{}}
          }});
          node.click();
          report.hoverPrimed = true;
        }} else if (method === 'operations_delegate_click') {{
          // Permanently disabled: the shared operations container can contain
          // "回复 / 删除 / 举报". Clicking the container or its center is destructive.
          report.error = 'unsafe_operations_delegate_click_disabled';
          report.blockedUnsafeMethod = true;
          return report;
        }} else if (method === 'dom_node_click') {{
          const clickTarget = node;
          try {{ clickTarget.focus?.({{preventScroll: true}}); }} catch (_) {{}}
          try {{
            HTMLElement.prototype.click.call(clickTarget);
          }} catch (_) {{
            clickTarget.click();
          }}
          report.domNodeClick = {{rect: rectOf(clickTarget), hint: pathHint(clickTarget), text: textOf(clickTarget).slice(0, 80)}};
        }} else if (method === 'element_from_point_sequence') {{
          let target = document.elementFromPoint(cx, cy) || node;
          if (target && !node.contains(target) && target !== node) target = node;
          pointer('pointerdown', target);
          mouse('mousedown', target);
          pointer('pointerup', target);
          mouse('mouseup', target);
          mouse('click', target);
        }} else if (method === 'mouse_down_up_center') {{
          mouse('mousedown');
          mouse('mouseup');
          mouse('click');
        }} else if (method === 'closest_action_click') {{
          const clickTarget = node;
          const r2 = clickTarget.getBoundingClientRect();
          const x2 = r2.left + Math.max(3, Math.min(Math.max(3, r2.width - 3), r2.width / 2));
          const y2 = r2.top + Math.max(3, Math.min(Math.max(3, r2.height - 3), r2.height / 2));
          clickTarget.dispatchEvent(new MouseEvent('click', {{bubbles: true, cancelable: true, composed: true, view: window, clientX: x2, clientY: y2, button: 0}}));
        }} else {{
          // dom_click_current: exactly one synthesized click sequence. Do not call node.click() afterwards.
          pointer('pointerdown');
          mouse('mousedown');
          pointer('pointerup');
          mouse('mouseup');
          mouse('click');
        }}
        report.fired = true;
      }} catch (err) {{
        report.error = String(err);
        try {{
          node.dispatchEvent(new MouseEvent('click', {{bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, button: 0}}));
          report.fired = true;
          report.fallback = 'single_mouse_click';
        }} catch (innerErr) {{
          report.error += ' | fallback=' + String(innerErr);
        }}
      }}
      return report;
    }};

    const findVisibleReplyEditor = (host, band = null) => {{
      const roots = [];
      if (host) roots.push(host);
      if (host && host.parentElement) roots.push(host.parentElement);
      roots.push(document);
      const seen = new Set();
      for (const root of roots) {{
        const inputs = Array.from(root.querySelectorAll('.input-d24X73[contenteditable="true"], .textarea-NCe55j, textarea, [contenteditable="true"]'));
        for (const el of inputs) {{
          if (!el || seen.has(el)) continue;
          seen.add(el);
          const ph = el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || '';
          if (visible(el) && (ph.startsWith('回复') || ph.includes('回复')) && (!band || nodeInBand(el, band))) return el;
        }}
      }}
      return null;
    }};

    const closeFilterFocusResidue = () => {{
      const active = document.activeElement;
      const activeHint = pathHint(active);
      const activeText = textOf(active).slice(0, 80);
      const countOpen = () => Array.from(document.querySelectorAll('.douyin-creator-interactive-select-open, [aria-expanded="true"]'))
        .filter((el) => visible(el)).length;
      const popoverText = () => Array.from(document.querySelectorAll('.douyin-creator-interactive-popover, .douyin-creator-interactive-select-option-list-wrapper, [class*=popover], [class*=dropdown]'))
        .filter((el) => visible(el)).map((el) => textOf(el).slice(0, 80)).filter(Boolean).slice(0, 4);
      const selectOpenBefore = countOpen();
      const popoversBefore = popoverText();
      try {{
        const evs = [
          new KeyboardEvent('keydown', {{bubbles: true, cancelable: true, key: 'Escape', code: 'Escape'}}),
          new KeyboardEvent('keyup', {{bubbles: true, cancelable: true, key: 'Escape', code: 'Escape'}}),
        ];
        for (const ev of evs) {{
          try {{ window.dispatchEvent(ev); }} catch (err) {{}}
          try {{ document.dispatchEvent(ev); }} catch (err) {{}}
          try {{ if (active) active.dispatchEvent(ev); }} catch (err) {{}}
        }}
      }} catch (err) {{}}
      try {{ if (active && active.blur) active.blur(); }} catch (err) {{}}
      try {{ if (document.body && document.body.focus) document.body.focus({{preventScroll: true}}); }} catch (err) {{}}
      const selectOpenAfter = countOpen();
      const popoversAfter = popoverText();
      return {{selectOpenBefore, selectOpenAfter, activeHint, activeText, popoversBefore, popoversAfter}};
    }};

    const focusResidueBeforeReplyClick = closeFilterFocusResidue();

    const cancelVisibleDeleteDialog = () => {{
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], .douyin-creator-interactive-modal, [class*="modal"], [class*="dialog"]'))
        .filter((el) => visible(el));
      for (const dialog of dialogs) {{
        const dialogText = textOf(dialog);
        if (!/删除/.test(dialogText)) continue;
        const cancel = Array.from(dialog.querySelectorAll('button,[role="button"],span,div'))
          .find((el) => visible(el) && textOf(el) === '取消');
        if (cancel) {{
          try {{ cancel.click(); }} catch (_) {{}}
          return {{cancelled: true, dialogText: dialogText.slice(0, 160), cancelHint: pathHint(cancel)}};
        }}
        return {{cancelled: false, dialogText: dialogText.slice(0, 160), cancelHint: ''}};
      }}
      return {{cancelled: false, dialogText: '', cancelHint: ''}};
    }};
    const destructiveDialogGuard = cancelVisibleDeleteDialog();
    if (destructiveDialogGuard.dialogText) {{
      return JSON.stringify({{ok: false, action: 'open_comment_reply_editor', state: destructiveDialogGuard.cancelled ? 'delete_dialog_cancelled' : 'delete_dialog_detected_no_safe_cancel', payload, focusResidueBeforeReplyClick, destructiveDialogGuard}});
    }}

    const topCards = Array.from(document.querySelectorAll('.container-sXKyMs'))
      .filter((card) => visible(card) && !card.closest('.reply-list-QwXCb_'))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const nestedCards = Array.from(document.querySelectorAll('.container-sXKyMs'))
      .filter((card) => visible(card) && !!card.closest('.reply-list-QwXCb_'))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const cardBand = (card) => {{
      const index = topCards.indexOf(card);
      const rect = card.getBoundingClientRect();
      const next = index >= 0 ? topCards[index + 1] : null;
      const nextRect = next ? next.getBoundingClientRect() : null;
      return {{index, top: rect.top - 2, bottom: nextRect ? (nextRect.top - 2) : Number.POSITIVE_INFINITY}};
    }};
    const nodeInBand = (node, band) => {{
      if (!node || !(node instanceof Element) || !band) return false;
      const r = node.getBoundingClientRect();
      const y = r.top + Math.min(Math.max(r.height / 2, 1), 12);
      return y >= band.top && y < band.bottom;
    }};
    const nestedCardsForTopCard = (card) => {{
      const band = cardBand(card);
      return nestedCards.filter((node) => nodeInBand(node, band));
    }};
    const safeReplyText = (value) => {{
      const t = String(value || '').replace(/\s+/g, ' ').trim();
      return /^回复(?:\s*[（(]?\d+[）)]?)?$/.test(t) && !/删除|举报|取消|发送/.test(t);
    }};
    const mapReplyButton = (opsNode) => {{
      if (!opsNode || !(opsNode instanceof Element)) return {{replyBtn: null, replyLabel: null, replyAction: null, replyButtonSafe: false, replyButtonText: '', actionTexts: []}};
      const allNodes = Array.from(opsNode.querySelectorAll('.item-M3fSkJ, button, [role="button"], span, div, a'))
        .filter((el) => el instanceof Element && visible(el));
      const labels = allNodes
        .filter((el) => textOf(el) === '回复')
        .filter((el) => !Array.from(el.children || []).some((child) => visible(child) && textOf(child) === '回复'))
        .sort((a, b) => {{
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return (ra.width * ra.height) - (rb.width * rb.height);
        }});
      const label = labels.length ? labels[0] : null;
      const resolveAction = (source) => {{
        let cur = source;
        while (cur && cur instanceof Element && cur !== opsNode) {{
          const actionLike = cur.matches('button,[role="button"],.item-M3fSkJ,[class*="item-"]') || cur.parentElement === opsNode;
          if (actionLike && visible(cur) && safeReplyText(textOf(cur))) return cur;
          cur = cur.parentElement;
        }}
        return source && visible(source) && safeReplyText(textOf(source)) ? source : null;
      }};
      const action = resolveAction(label) || Array.from(opsNode.querySelectorAll('.item-M3fSkJ, button, [role="button"]'))
        .filter((el) => visible(el) && safeReplyText(textOf(el)))
        .sort((a, b) => {{
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return (ra.width * ra.height) - (rb.width * rb.height);
        }})[0] || null;
      const preferred = label || action;
      return {{
        replyBtn: preferred,
        replyLabel: label,
        replyAction: action,
        replyButtonSafe: !!preferred && safeReplyText(textOf(preferred)),
        replyButtonText: preferred ? textOf(preferred) : '',
        actionTexts: allNodes.map((el) => textOf(el)).filter(Boolean).slice(0, 16),
      }};
    }};
    const hashReplyKey = (value) => {{
      const text = String(value || '');
      let hash = 2166136261;
      for (let i = 0; i < text.length; i += 1) {{ hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }}
      return (hash >>> 0).toString(36);
    }};
    const makeReplyDomKey = (threadAuthor, threadContent, level, index, author, content) => (
      'ucp_reply_' + hashReplyKey([threadAuthor || '', threadContent || '', level || '', String(index ?? -1), author || '', content || ''].join('\u241f'))
    );
    const registryEntryValid = (entry, candidate) => {{
      if (!entry || !candidate) return false;
      const node = entry.replyAction || entry.replyLabel;
      if (!(node instanceof Element) || !node.isConnected || !visible(node)) return false;
      if (entry.card instanceof Element && (!entry.card.isConnected || !visible(entry.card))) return false;
      if (String(entry.level || '') !== String(candidate.targetLevel || '')) return false;
      if (String(entry.author || '') !== String(candidate.author || '')) return false;
      if (String(entry.content || '') !== String(candidate.content || '')) return false;
      return safeReplyText(textOf(node));
    }};
    const findOwnOperations = (card) => {{
      if (!card || !(card instanceof Element)) return null;
      const cardRect = card.getBoundingClientRect();
      return Array.from(card.querySelectorAll('.operations-WFV7Am, [class*="operations-"]'))
        .filter((el) => el instanceof Element && visible(el))
        .filter((el) => el.closest('.container-sXKyMs') === card)
        .sort((a, b) => {{
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return Math.abs(ra.top - cardRect.top) - Math.abs(rb.top - cardRect.top);
        }})[0] || null;
    }};

    const mapped = topCards.map((card) => {{
      const authorNode = card.querySelector('.username-aLgaNB');
      const timeNode = card.querySelector('.time-NRtTXO');
      const opsNode = findOwnOperations(card);
      const topReply = mapReplyButton(opsNode);
      const authorName = ownText(authorNode, ['.tag-DAEcKE']);
      const timeText = textOf(timeNode);
      const contentText = extractCommentContent(card, authorName, timeText).slice(0, 200);
      const threadKey = [authorName, timeText, contentText.slice(0, 80)].join(' | ');
      const topTarget = {{
        level: 'top',
        index: -1,
        card,
        author: authorName,
        timeText,
        content: contentText,
        replyBtn: topReply.replyBtn,
        replyLabel: topReply.replyLabel,
        replyAction: topReply.replyAction,
        replyButtonSafe: !!topReply.replyButtonSafe,
        replyButtonText: topReply.replyButtonText || '',
        replyButtonHint: topReply.replyBtn ? pathHint(topReply.replyBtn) : '',
        actionTexts: topReply.actionTexts,
        messageKey: [threadKey, 'top', '-1', authorName || '', timeText || '', String(contentText || '').slice(0, 80)].join(' | '),
      }};
      const nestedTargets = nestedCardsForTopCard(card).map((node, index) => {{
        const nestedAuthor = node.querySelector('.username-aLgaNB');
        const nestedTime = node.querySelector('.time-NRtTXO');
        const nestedOps = findOwnOperations(node);
        const nestedReply = mapReplyButton(nestedOps);
        const nestedAuthorName = ownText(nestedAuthor, ['.tag-DAEcKE']);
        const nestedTimeText = textOf(nestedTime);
        const nestedContent = extractCommentContent(node, nestedAuthorName, nestedTimeText).slice(0, 200);
        return {{
          level: 'nested',
          index,
          card: node,
          author: nestedAuthorName,
          timeText: nestedTimeText,
          content: nestedContent,
          replyBtn: nestedReply.replyBtn,
          replyLabel: nestedReply.replyLabel,
          replyAction: nestedReply.replyAction,
          replyButtonSafe: !!nestedReply.replyButtonSafe,
          replyButtonText: nestedReply.replyButtonText || '',
          replyButtonHint: nestedReply.replyBtn ? pathHint(nestedReply.replyBtn) : '',
          actionTexts: nestedReply.actionTexts,
          messageKey: [threadKey, 'nested', String(index), nestedAuthorName || '', nestedTimeText || '', String(nestedContent || '').slice(0, 80)].join(' | '),
        }};
      }});
      let target = topTarget;
      const nestedByKey = nestedTargets.find((item) => payload.targetMessageKey && item.messageKey === payload.targetMessageKey) || null;
      const nestedByIndex = nestedTargets.find((item) => payload.targetLevel === 'nested' && Number(item.index) === Number(payload.targetIndex)) || null;
      const nestedExact = nestedTargets.find((item) => payload.content && item.content === payload.content && (!payload.author || item.author === payload.author) && (!payload.timeText || item.timeText === payload.timeText)) || null;
      if (nestedByKey) target = nestedByKey;
      else if (nestedByIndex) target = nestedByIndex;
      else if (nestedExact) target = nestedExact;
      const replyDomKey = makeReplyDomKey(authorName, contentText, target.level, target.index, target.author, target.content);
      return {{
        card,
        threadKey,
        threadAuthor: authorName,
        threadTimeText: timeText,
        threadContent: contentText,
        author: target.author,
        timeText: target.timeText,
        content: target.content,
        targetLevel: target.level,
        targetIndex: target.index,
        targetCard: target.card,
        targetMessageKey: target.messageKey || '',
        replyDomKey,
        replyBtn: target.replyBtn,
        replyLabel: target.replyLabel,
        replyAction: target.replyAction,
        actionTexts: target.actionTexts,
        replyButtonFound: !!target.replyBtn,
        replyButtonSafe: !!target.replyButtonSafe,
        replyButtonText: target.replyButtonText || '',
        replyButtonHint: target.replyButtonHint,
        nestedTargetCount: nestedTargets.length,
      }};
    }});

    const mappedSummary = mapped.map((item, index) => ({{
      index,
      threadKey: item.threadKey,
      author: item.author,
      timeText: item.timeText,
      content: item.content,
      targetLevel: item.targetLevel,
      targetIndex: item.targetIndex,
      targetMessageKey: item.targetMessageKey,
      replyDomKey: item.replyDomKey,
      nestedTargetCount: item.nestedTargetCount,
      replyButtonFound: !!item.replyBtn,
      replyButtonSafe: !!item.replyButtonSafe,
      replyButtonText: item.replyButtonText || '',
      actionTexts: item.actionTexts,
      replyButtonHint: item.replyButtonHint,
    }})).slice(0, 8);
    let selectedBy = '';
    let candidate = mapped.find((item) => payload.replyDomKey && item.replyDomKey === payload.replyDomKey) || null;
    if (candidate) selectedBy = 'reply_dom_key';
    if (!candidate) {{
      candidate = mapped.find((item) => payload.targetMessageKey && item.targetMessageKey === payload.targetMessageKey) || null;
      if (candidate) selectedBy = 'target_message_key';
    }}
    if (!candidate && payload.threadKey && payload.targetLevel) {{
      const strictMatches = mapped.filter((item) => (
        item.threadKey === payload.threadKey
        && item.targetLevel === payload.targetLevel
        && Number(item.targetIndex) === Number(payload.targetIndex)
        && (!payload.author || item.author === payload.author)
        && (!payload.content || item.content === payload.content)
      ));
      if (strictMatches.length === 1) {{
        candidate = strictMatches[0];
        selectedBy = 'thread_target_exact_unique';
      }}
    }}
    // Compatibility fallback is intentionally limited to payloads created before
    // replyDomKey/targetMessageKey existed. A modern precise-DOM payload must never
    // fall back to a different thread merely because author/content happens to match.
    if (!candidate && !payload.replyDomKey && !payload.targetMessageKey) {{
      const legacyMatches = mapped.filter((item) => (
        (!payload.threadKey || item.threadKey === payload.threadKey)
        && (!payload.targetLevel || item.targetLevel === payload.targetLevel)
        && (!payload.author || item.author === payload.author)
        && (!payload.content || item.content === payload.content)
      ));
      if (legacyMatches.length === 1) {{
        candidate = legacyMatches[0];
        selectedBy = 'legacy_exact_unique';
      }}
    }}

    if (!candidate || !candidate.replyBtn) {{
      return JSON.stringify({{ok: false, action: 'open_comment_reply_editor', state: 'candidate_missing', payload, mapped: mappedSummary, selectedBy, focusResidueBeforeReplyClick}});
    }}
    if (!candidate.replyButtonSafe || !/^回复(?:\s*[（(]?\d+[）)]?)?$/.test(candidate.replyButtonText || '') || /删除|举报|取消|发送/.test(candidate.replyButtonText || '')) {{
      return JSON.stringify({{ok: false, action: 'open_comment_reply_editor', state: 'unsafe_reply_button_rejected', payload, mapped: mappedSummary, selectedBy, focusResidueBeforeReplyClick, target: {{threadKey: candidate.threadKey, author: candidate.author, content: candidate.content, targetLevel: candidate.targetLevel, targetIndex: candidate.targetIndex, replyButtonText: candidate.replyButtonText || '', replyButtonHint: candidate.replyButtonHint || '', actionTexts: candidate.actionTexts || []}}}});
    }}

    const threadHost = candidate.card.parentElement || candidate.card;
    const candidateBand = cardBand(candidate.card);
    const existingInput = findVisibleReplyEditor(threadHost, candidateBand);
    if (existingInput) {{
      return JSON.stringify({{ok: true, action: 'open_comment_reply_editor', state: 'already_visible', payload, selectedBy, mapped: mappedSummary, focusResidueBeforeReplyClick, target: {{threadKey: candidate.threadKey, author: candidate.author, content: candidate.content, targetLevel: candidate.targetLevel, targetIndex: candidate.targetIndex, rect: rectOf(candidate.targetCard || candidate.card), hint: pathHint(candidate.targetCard || candidate.card)}}}});
    }}

    const beforeEditorCount = findVisibleReplyEditor(threadHost, candidateBand) ? 1 : 0;
    let registryEntry = null;
    try {{
      const registry = window.__ucpCommentReplyRegistry;
      if (registry && typeof registry.get === 'function' && payload.replyDomKey) registryEntry = registry.get(payload.replyDomKey) || null;
    }} catch (err) {{ registryEntry = null; }}
    const registryValid = registryEntryValid(registryEntry, candidate);
    const method = payload.openMethod || 'precise_dom_registered_click';
    let clickNode = null;
    let clickSource = '';
    if (method === 'precise_dom_registered_click' && registryValid) {{
      // Click the actual action module first. The inner text span is only a label and
      // may not own Douyin's framework click handler.
      clickNode = registryEntry.replyAction || registryEntry.replyLabel;
      clickSource = registryEntry.replyAction ? 'inspect_registry_exact_action' : 'inspect_registry_exact_label_fallback';
    }} else if (method === 'precise_dom_action_click') {{
      clickNode = candidate.replyAction || candidate.replyLabel || candidate.replyBtn;
      clickSource = candidate.replyAction ? 'reacquired_exact_action' : 'reacquired_exact_label_fallback';
    }} else {{
      clickNode = candidate.replyAction || candidate.replyLabel || candidate.replyBtn;
      clickSource = candidate.replyAction
        ? (registryValid ? 'registry_fallback_exact_action' : 'reacquired_exact_action')
        : (registryValid ? 'registry_fallback_exact_label' : 'reacquired_exact_label');
    }}
    if (!(clickNode instanceof Element) || !clickNode.isConnected || !visible(clickNode) || !safeReplyText(textOf(clickNode))) {{
      return JSON.stringify({{ok: false, action: 'open_comment_reply_editor', state: 'precise_reply_dom_missing', payload, selectedBy, mapped: mappedSummary, focusResidueBeforeReplyClick, target: {{threadKey: candidate.threadKey, author: candidate.author, content: candidate.content, targetLevel: candidate.targetLevel, targetIndex: candidate.targetIndex, replyDomKey: candidate.replyDomKey, registryValid, clickSource, replyButtonText: clickNode ? textOf(clickNode) : '', replyButtonHint: clickNode ? pathHint(clickNode) : ''}}}});
    }}
    const existingTxn = (window.__ucpCommentReplyTransaction && typeof window.__ucpCommentReplyTransaction === 'object')
      ? window.__ucpCommentReplyTransaction
      : null;
    const transactionMatches = !!(existingTxn && (
      (payload.replyDomKey && existingTxn.replyDomKey === payload.replyDomKey)
      || (payload.targetMessageKey && existingTxn.targetMessageKey === payload.targetMessageKey)
    ));
    const transactionId = transactionMatches && existingTxn.transactionId
      ? existingTxn.transactionId
      : ('ucp_comment_txn_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8));
    const rootCard = (registryEntry && registryEntry.rootCard instanceof Element && registryEntry.rootCard.isConnected)
      ? registryEntry.rootCard
      : candidate.card;
    const targetCard = candidate.targetCard || (registryEntry && registryEntry.card) || candidate.card;
    try {{
      window.__ucpCommentReplyTransaction = {{
        ...(transactionMatches ? existingTxn : {{}}),
        transactionId,
        replyDomKey: candidate.replyDomKey || payload.replyDomKey || '',
        targetMessageKey: candidate.targetMessageKey || payload.targetMessageKey || '',
        targetLevel: candidate.targetLevel || payload.targetLevel || '',
        targetIndex: Number(candidate.targetIndex ?? payload.targetIndex ?? -1),
        targetAuthor: candidate.author || payload.author || '',
        targetContent: candidate.content || payload.content || '',
        threadKey: candidate.threadKey || payload.threadKey || '',
        rootCard,
        targetCard,
        replyAction: clickNode,
        editorNode: transactionMatches ? existingTxn.editorNode || null : null,
        inputNode: transactionMatches ? existingTxn.inputNode || null : null,
        sendNode: transactionMatches ? existingTxn.sendNode || null : null,
        state: 'reply_click_dispatched',
        beforeEditorCount,
        clickedAt: Date.now(),
      }};
      if (rootCard instanceof Element) rootCard.setAttribute('data-ucp-active-reply-transaction', transactionId);
      if (targetCard instanceof Element) targetCard.setAttribute('data-ucp-active-reply-target', transactionId);
    }} catch (_) {{}}
    const click = clickReport(clickNode, method);
    click.transactionId = transactionId;
    click.safeReplyAction = true;
    click.targetText = textOf(clickNode);
    click.clickSource = clickSource;
    click.replyDomKey = candidate.replyDomKey || payload.replyDomKey || '';
    click.registryValid = registryValid;
    const afterInput = findVisibleReplyEditor(threadHost, candidateBand);
    const afterEditorCount = afterInput ? 1 : 0;
    return JSON.stringify({{ok: true, action: 'open_comment_reply_editor', state: 'clicked', payload, selectedBy, mapped: mappedSummary, focusResidueBeforeReplyClick, target: {{threadKey: candidate.threadKey, author: candidate.author, content: candidate.content, targetLevel: candidate.targetLevel, targetIndex: candidate.targetIndex, rect: rectOf(candidate.targetCard || candidate.card), hint: pathHint(candidate.targetCard || candidate.card), replyButtonRect: rectOf(clickNode), replyButtonHint: pathHint(clickNode), replyDomKey: candidate.replyDomKey || payload.replyDomKey || '', registryValid, clickSource, beforeEditorCount, afterEditorCount, click}}}});
  }} catch (err) {{
    return JSON.stringify({{ok: false, action: 'open_comment_reply_editor', state: 'error', error: String(err)}});
  }}
}})();
"""




def build_comment_focus_reply_editor_script(
    thread_key: str,
    author: str,
    content: str,
    *,
    target_message_key: str = "",
    reply_dom_key: str = "",
    target_level: str = "",
    target_index: int = -999,
    target_parent_thread_key: str = "",
) -> str:
    import json as _json
    payload = _json.dumps({
        "threadKey": thread_key,
        "author": author,
        "content": content,
        "targetMessageKey": target_message_key,
        "replyDomKey": reply_dom_key,
        "targetLevel": target_level,
        "targetIndex": target_index,
        "targetParentThreadKey": target_parent_thread_key,
    }, ensure_ascii=False)
    return rf"""
(() => {{
  try {{
    const payload = {payload};
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {{
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.02 && rect.width >= 2 && rect.height >= 2;
    }};
    const rectOf = (el) => {{
      if (!el || !(el instanceof Element)) return {{x: 0, y: 0, w: 0, h: 0}};
      const r = el.getBoundingClientRect();
      return {{x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}};
    }};
    const pathHint = (el) => {{
      if (!el || !(el instanceof Element)) return '';
      const parts = [];
      let cur = el;
      for (let i = 0; i < 5 && cur; i += 1) {{
        let part = (cur.tagName || '').toLowerCase();
        if (!part) break;
        if (cur.id) part += '#' + cur.id;
        const cls = (typeof cur.className === 'string' ? cur.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
        if (cls.length) part += '.' + cls.join('.');
        parts.push(part);
        cur = cur.parentElement;
      }}
      return parts.join(' <- ');
    }};
    const ownText = (el, omitSelectors = []) => {{
      if (!el || !(el instanceof Element)) return '';
      const clone = el.cloneNode(true);
      omitSelectors.forEach((sel) => clone.querySelectorAll(sel).forEach((node) => node.remove()));
      return textOf(clone);
    }};
    const richTextOf = (node) => {{
      if (!node) return '';
      const parts = [];
      const walk = (cur) => {{
        if (!cur) return;
        if (cur.nodeType === Node.TEXT_NODE) {{ parts.push(cur.textContent || ''); return; }}
        if (!(cur instanceof Element)) return;
        const tag = (cur.tagName || '').toLowerCase();
        if (tag === 'img') {{ parts.push(cur.getAttribute('alt') || cur.getAttribute('data-type') || cur.getAttribute('title') || cur.getAttribute('aria-label') || ''); return; }}
        if (tag === 'br') {{ parts.push(' '); return; }}
        Array.from(cur.childNodes || []).forEach(walk);
      }};
      walk(node);
      return parts.join('').replace(/\s+/g, ' ').trim();
    }};
    const extractCommentContent = (card, authorText = '', timeText = '') => {{
      if (!card || !(card instanceof Element)) return '';
      const direct = Array.from(card.querySelectorAll('.comment-content-text-JvmAKq, [class*="comment-content-text"], [class*="comment-content"], [class*="content-text"], [class*="commentText"]'))
        .map((node) => richTextOf(node) || textOf(node))
        .find(Boolean);
      if (direct) return direct.slice(0, 240);
      const clone = card.cloneNode(true);
      clone.querySelectorAll('img').forEach((node) => {{
        const token = node.getAttribute('alt') || node.getAttribute('data-type') || node.getAttribute('title') || node.getAttribute('aria-label') || '';
        try {{ node.replaceWith(document.createTextNode(token)); }} catch (err) {{}}
      }});
      [
        '.username-aLgaNB', '[class*="username"]', '.tag-DAEcKE', '[class*="tag-"]',
        '.time-NRtTXO', '[class*="time-"]', '.operations-WFV7Am', '[class*="operation"]',
        '.reply-list-QwXCb_', '[class*="reply-list"]', '.reply-content-obcMk0', '.reply-NYBpwz',
        '.wrap-NeUN4f', '.footer-oZJTJd', '[contenteditable="true"]', 'textarea', 'button',
        '.douyin-creator-interactive-popover', '.douyin-creator-interactive-select',
      ].forEach((sel) => clone.querySelectorAll(sel).forEach((node) => node.remove()));
      let text = richTextOf(clone) || textOf(clone);
      [authorText, timeText, '回复', '点赞', '取消', '发送'].filter(Boolean).forEach((token) => {{ text = text.replace(token, ' '); }});
      return text.replace(/\s+/g, ' ').trim().slice(0, 240);
    }};
    const findLocalReplyEditor = (host) => {{
      if (!host || !(host instanceof Element)) return null;
      const nodes = [host, ...Array.from(host.querySelectorAll('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6'))]
        .filter((node, index, arr) => node instanceof Element && arr.indexOf(node) === index)
        .filter(visible);
      for (const node of nodes) {{
        const inputNode = node.matches?.('.input-d24X73[contenteditable="true"], .textarea-NCe55j, textarea, [contenteditable="true"]')
          ? node
          : node.querySelector('.input-d24X73[contenteditable="true"], .textarea-NCe55j, textarea, [contenteditable="true"]');
        if (!inputNode || !visible(inputNode)) continue;
        const placeholder = inputNode.getAttribute('placeholder') || inputNode.getAttribute('aria-placeholder') || '';
        const footer = node.querySelector('.footer-oZJTJd') || node.closest('.wrap-NeUN4f')?.querySelector('.footer-oZJTJd') || node;
        const sendNode = Array.from(footer.querySelectorAll('button, [role="button"], span, div')).find((el) => visible(el) && textOf(el) === '发送') || null;
        const cancelNode = Array.from(footer.querySelectorAll('button, [role="button"], span, div')).find((el) => visible(el) && textOf(el) === '取消') || null;
        const replyWrapper = inputNode.closest('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6');
        const isReplyScoped = placeholder.startsWith('回复') || !!cancelNode || !!sendNode || !!replyWrapper;
        const inTopComposerOnly = !!inputNode.closest('.content-wWJcbN') && !replyWrapper && !cancelNode && !sendNode && !placeholder.startsWith('回复');
        if (isReplyScoped && !inTopComposerOnly) {{
          const editorNode = (node === inputNode)
            ? (inputNode.closest('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6') || inputNode.parentElement || inputNode)
            : node;
          return {{node: editorNode, inputNode, placeholder}};
        }}
      }}
      return null;
    }};
    const cards = Array.from(document.querySelectorAll('.container-sXKyMs')).filter((card) => visible(card) && !card.closest('.reply-list-QwXCb_'));
    const txn = (window.__ucpCommentReplyTransaction && typeof window.__ucpCommentReplyTransaction === 'object') ? window.__ucpCommentReplyTransaction : null;
    const txnMatches = !!(txn && (
      (payload.replyDomKey && txn.replyDomKey === payload.replyDomKey)
      || (payload.targetMessageKey && txn.targetMessageKey === payload.targetMessageKey)
    ));
    let registryEntry = null;
    try {{
      const registry = window.__ucpCommentReplyRegistry;
      if (registry && typeof registry.get === 'function' && payload.replyDomKey) registryEntry = registry.get(payload.replyDomKey) || null;
    }} catch (_) {{ registryEntry = null; }}
    const exactRootCard = txnMatches && txn.rootCard instanceof Element && txn.rootCard.isConnected
      ? txn.rootCard
      : (registryEntry && registryEntry.rootCard instanceof Element && registryEntry.rootCard.isConnected ? registryEntry.rootCard : null);
    const exactTargetCard = txnMatches && txn.targetCard instanceof Element && txn.targetCard.isConnected
      ? txn.targetCard
      : (registryEntry && registryEntry.card instanceof Element && registryEntry.card.isConnected ? registryEntry.card : null);
    const mapped = cards.map((card) => {{
      const authorNode = card.querySelector('.username-aLgaNB');
      const timeNode = card.querySelector('.time-NRtTXO');
      const authorName = ownText(authorNode, ['.tag-DAEcKE']);
      const timeText = textOf(timeNode);
      const contentText = extractCommentContent(card, authorName, timeText).slice(0, 200);
      return {{card, author: authorName, timeText, content: contentText, threadKey: [authorName, timeText, contentText.slice(0, 80)].join(' | ')}};
    }});
    let candidate = exactRootCard ? mapped.find((item) => item.card === exactRootCard) || null : null;
    let selectedBy = candidate ? (txnMatches ? 'active_transaction_root' : 'reply_registry_root') : '';
    if (!candidate) {{ candidate = mapped.find((item) => payload.threadKey && item.threadKey === payload.threadKey) || null; if (candidate) selectedBy = 'threadKey'; }}
    if (!candidate && !payload.replyDomKey && !payload.targetMessageKey) {{ candidate = mapped.find((item) => item.author === payload.author && payload.content && item.content === payload.content) || null; if (candidate) selectedBy = 'legacy_author_content'; }}
    if (!candidate && !payload.replyDomKey && !payload.targetMessageKey) {{ const authorMatches = mapped.filter((item) => item.author === payload.author); if (authorMatches.length === 1) {{ candidate = authorMatches[0]; selectedBy = 'legacy_author_unique'; }} }}
    if (!candidate) {{
      return JSON.stringify({{ok: false, action: 'focus_comment_reply_editor', state: 'candidate_missing', payload, mapped: mapped.map((x, i) => ({{index: i, threadKey: x.threadKey, author: x.author, timeText: x.timeText, content: x.content}})).slice(0, 8)}});
    }}
    const threadHost = candidate.card.parentElement || candidate.card;
    let match = null;
    if (txnMatches && txn.editorNode instanceof Element && txn.editorNode.isConnected && visible(txn.editorNode)
        && txn.inputNode instanceof Element && txn.inputNode.isConnected && visible(txn.inputNode)) {{
      const footer = txn.editorNode.querySelector?.('.footer-oZJTJd') || txn.editorNode;
      const sendNode = txn.sendNode instanceof Element && txn.sendNode.isConnected
        ? txn.sendNode
        : Array.from(footer.querySelectorAll?.('button, [role="button"], span, div') || []).find((el) => visible(el) && textOf(el) === '发送') || null;
      match = {{node: txn.editorNode, inputNode: txn.inputNode, sendNode, placeholder: txn.inputNode.getAttribute('placeholder') || txn.inputNode.getAttribute('aria-placeholder') || ''}};
      selectedBy = 'active_transaction_editor';
    }}
    if (!match && exactTargetCard) {{
      match = findLocalReplyEditor(exactTargetCard);
      if (match) selectedBy = txnMatches ? 'active_transaction_target_editor' : 'reply_registry_target_editor';
    }}
    if (!match) match = findLocalReplyEditor(threadHost);
    // D10: nested reply editors can be rendered outside the root thread band.
    // When the modern D9 transaction matches and exactly one visible reply editor
    // exists on the page, bind that editor to the transaction instead of clicking
    // the same toggle reply action again.
    const transactionOpenedFromEmpty = !!(txnMatches
      && Number(txn.beforeEditorCount || 0) === 0
      && Number(txn.clickedAt || 0) > 0
      && Date.now() - Number(txn.clickedAt || 0) <= 30000);
    if (!match && transactionOpenedFromEmpty && (payload.replyDomKey || payload.targetMessageKey)) {{
      const selector = '.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6';
      const globalMatches = [];
      const seenInputs = new Set();
      for (const node of Array.from(document.querySelectorAll(selector)).filter(visible)) {{
        const found = findLocalReplyEditor(node);
        if (!found || !found.inputNode || seenInputs.has(found.inputNode)) continue;
        seenInputs.add(found.inputNode);
        globalMatches.push(found);
      }}
      if (globalMatches.length === 1) {{
        match = globalMatches[0];
        selectedBy = 'active_transaction_global_editor';
      }}
    }}
    if (!match || !match.inputNode) {{
      const replyBtn = Array.from((candidate.card.querySelector('.operations-WFV7Am') || candidate.card).querySelectorAll('.item-M3fSkJ, button, [role="button"], span, div')).find((el) => visible(el) && textOf(el).includes('回复')) || null;
      return JSON.stringify({{ok: false, action: 'focus_comment_reply_editor', state: 'reply_editor_missing', payload, selectedBy, target: {{threadKey: candidate.threadKey, author: candidate.author, content: candidate.content, replyButtonFound: !!replyBtn, replyButtonRect: rectOf(replyBtn), replyButtonHint: replyBtn ? pathHint(replyBtn) : '', cardRect: rectOf(candidate.card), cardHint: pathHint(candidate.card)}}}});
    }}
    try {{
      if (txnMatches) {{
        txn.rootCard = candidate.card;
        txn.targetCard = exactTargetCard || txn.targetCard || candidate.card;
        txn.editorNode = match.node;
        txn.inputNode = match.inputNode;
        txn.sendNode = match.sendNode || txn.sendNode || null;
        txn.editorDomKey = txn.editorDomKey || ('ucp_editor_' + String(txn.transactionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(-48));
        txn.state = 'editor_bound';
        txn.editorBoundAt = Date.now();
        window.__ucpCommentReplyTransaction = txn;
        if (match.node instanceof Element && txn.transactionId) match.node.setAttribute('data-ucp-editor-transaction', txn.transactionId);
        if (match.node instanceof Element && txn.editorDomKey) match.node.setAttribute('data-ucp-editor-dom-key', txn.editorDomKey);
      }}
    }} catch (_) {{}}
    const input = match.inputNode;
    const focusMethods = [];
    try {{ input.scrollIntoView({{block: 'center', inline: 'nearest'}}); focusMethods.push('scroll_into_view'); }} catch (err) {{}}
    try {{
      const rect = input.getBoundingClientRect();
      const cx = rect.left + Math.max(4, Math.min(rect.width - 4, rect.width / 2));
      const cy = rect.top + Math.max(4, Math.min(rect.height - 4, rect.height / 2));
      const hit = document.elementFromPoint(cx, cy);
      const clickTarget = (hit && (hit === input || input.contains(hit) || hit.closest?.('.input-d24X73, [contenteditable="true"], textarea'))) ? hit : input;
      ['pointerover', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => clickTarget.dispatchEvent(new MouseEvent(type, {{bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, button: 0}})));
      focusMethods.push('mouse_sequence');
    }} catch (err) {{}}
    try {{
      if (!input.hasAttribute('tabindex') && input.isContentEditable) input.setAttribute('tabindex', '-1');
      input.focus({{preventScroll: true}});
      focusMethods.push('focus_prevent_scroll');
    }} catch (err) {{ try {{ input.focus(); focusMethods.push('focus_plain'); }} catch (err2) {{}} }}
    try {{
      const selection = window.getSelection && window.getSelection();
      if (selection && input.isContentEditable) {{
        const range = document.createRange();
        range.selectNodeContents(input);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        focusMethods.push('selection_caret_end');
      }} else if ('setSelectionRange' in input) {{
        const len = String(input.value || '').length;
        input.setSelectionRange(len, len);
        focusMethods.push('selection_range_end');
      }}
    }} catch (err) {{}}
    try {{
      input.dispatchEvent(new FocusEvent('focusin', {{bubbles: true, cancelable: false, composed: true, relatedTarget: null}}));
      input.dispatchEvent(new FocusEvent('focus', {{bubbles: false, cancelable: false, composed: true, relatedTarget: null}}));
      focusMethods.push('focus_events');
    }} catch (err) {{}}
    const active = document.activeElement instanceof Element ? document.activeElement : null;
    const activePlaceholder = active ? (active.getAttribute('placeholder') || active.getAttribute('aria-placeholder') || '') : '';
    const activeInReplyWrap = !!(active && active.closest('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6')) && !(active && active.closest('.content-wWJcbN') && !activePlaceholder.startsWith('回复'));
    const activeInTopComposer = !!(active && active.closest('.content-wWJcbN'));
    return JSON.stringify({{
      ok: active === input || activeInReplyWrap,
      action: 'focus_comment_reply_editor',
      state: active === input || activeInReplyWrap ? 'focused' : 'focus_not_confirmed',
      payload,
      selectedBy,
      transactionId: txnMatches ? (txn.transactionId || '') : '',
      editorDomKey: txnMatches ? (txn.editorDomKey || '') : '',
      focusMethods,
      target: {{threadKey: candidate.threadKey, author: candidate.author, content: candidate.content, cardRect: rectOf(candidate.card), cardHint: pathHint(candidate.card), editorRect: rectOf(match.node), editorHint: pathHint(match.node), inputRect: rectOf(input), inputHint: pathHint(input), placeholder: match.placeholder}},
      activeElement: active ? {{tag: (active.tagName || '').toLowerCase(), className: typeof active.className === 'string' ? active.className.slice(0, 180) : '', placeholder: activePlaceholder, text: textOf(active).slice(0, 120), editable: active.getAttribute('contenteditable') || '', rect: rectOf(active), hint: pathHint(active), inReplyWrap: activeInReplyWrap, inTopComposer: activeInTopComposer}} : {{found: false}}
    }});
  }} catch (err) {{
    return JSON.stringify({{ok: false, action: 'focus_comment_reply_editor', state: 'error', error: String(err)}});
  }}
}})();
"""


def build_comment_probe_reply_draft_script(
    thread_key: str,
    author: str,
    content: str,
    draft_text: str,
    phase: str = "stage",
    *,
    target_message_key: str = "",
    reply_dom_key: str = "",
    target_level: str = "",
    target_index: int = -999,
    target_parent_thread_key: str = "",
) -> str:
    import json as _json
    payload = _json.dumps({
        "threadKey": thread_key,
        "author": author,
        "content": content,
        "draftText": draft_text,
        "phase": phase,
        "targetMessageKey": target_message_key,
        "replyDomKey": reply_dom_key,
        "targetLevel": target_level,
        "targetIndex": target_index,
        "targetParentThreadKey": target_parent_thread_key,
    }, ensure_ascii=False)
    return rf"""
(() => {{
  try {{
    const payload = {payload};
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {{
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.02 && rect.width >= 2 && rect.height >= 2;
    }};
    const rectOf = (el) => {{
      if (!el || !(el instanceof Element)) return {{x: 0, y: 0, w: 0, h: 0}};
      const r = el.getBoundingClientRect();
      return {{x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}};
    }};
    const centerOf = (el) => {{
      const r = rectOf(el);
      return {{x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2)}};
    }};
    const pathHint = (el) => {{
      if (!el || !(el instanceof Element)) return '';
      const parts = [];
      let cur = el;
      for (let i = 0; i < 6 && cur; i += 1) {{
        let part = (cur.tagName || '').toLowerCase();
        if (!part) break;
        if (cur.id) part += '#' + cur.id;
        const cls = (typeof cur.className === 'string' ? cur.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
        if (cls.length) part += '.' + cls.join('.');
        parts.push(part);
        cur = cur.parentElement;
      }}
      return parts.join(' <- ');
    }};
    const ownText = (el, omitSelectors = []) => {{
      if (!el || !(el instanceof Element)) return '';
      const clone = el.cloneNode(true);
      omitSelectors.forEach((sel) => clone.querySelectorAll(sel).forEach((node) => node.remove()));
      return textOf(clone);
    }};
    const extractCommentContent = (card, authorText = '', timeText = '') => {{
      if (!card || !(card instanceof Element)) return '';
      const richTextOf = (node) => {{
        if (!node) return '';
        const parts = [];
        const walk = (cur) => {{
          if (!cur) return;
          if (cur.nodeType === Node.TEXT_NODE) {{
            parts.push(cur.textContent || '');
            return;
          }}
          if (!(cur instanceof Element)) return;
          const tag = (cur.tagName || '').toLowerCase();
          if (tag === 'img') {{
            parts.push(cur.getAttribute('alt') || cur.getAttribute('data-type') || cur.getAttribute('title') || cur.getAttribute('aria-label') || '');
            return;
          }}
          if (tag === 'br') {{
            parts.push(' ');
            return;
          }}
          Array.from(cur.childNodes || []).forEach(walk);
        }};
        walk(node);
        return parts.join('').replace(/\s+/g, ' ').trim();
      }};
      const direct = Array.from(card.querySelectorAll('.comment-content-text-JvmAKq, [class*="comment-content-text"], [class*="comment-content"], [class*="content-text"], [class*="commentText"]'))
        .map((node) => richTextOf(node) || textOf(node))
        .find(Boolean);
      if (direct) return direct.slice(0, 240);
      const clone = card.cloneNode(true);
      clone.querySelectorAll('img').forEach((node) => {{
        const token = node.getAttribute('alt') || node.getAttribute('data-type') || node.getAttribute('title') || node.getAttribute('aria-label') || '';
        try {{
          node.replaceWith(document.createTextNode(token));
        }} catch (err) {{}}
      }});
      [
        '.username-aLgaNB', '[class*="username"]', '.tag-DAEcKE', '[class*="tag-"]',
        '.time-NRtTXO', '[class*="time-"]', '.operations-WFV7Am', '[class*="operation"]',
        '.reply-list-QwXCb_', '[class*="reply-list"]', '.reply-content-obcMk0', '.reply-NYBpwz',
        '.wrap-NeUN4f', '.footer-oZJTJd', '[contenteditable="true"]', 'textarea', 'button',
        '.douyin-creator-interactive-popover', '.douyin-creator-interactive-select',
      ].forEach((sel) => clone.querySelectorAll(sel).forEach((node) => node.remove()));
      let text = richTextOf(clone) || textOf(clone);
      [authorText, timeText, '回复', '点赞', '取消', '发送'].filter(Boolean).forEach((token) => {{
        text = text.replace(token, ' ');
      }});
      return text.replace(/\s+/g, ' ').trim().slice(0, 240);
    }};
    const getDisabled = (btn) => !!btn?.disabled || btn?.getAttribute('aria-disabled') === 'true' || btn?.classList?.contains('semi-button-disabled') || btn?.classList?.contains('douyin-creator-interactive-button-disabled') || btn?.classList?.contains('icon-disabled-P2iZUA');
    const fireClick = (node) => {{
      if (!node || !(node instanceof Element)) return false;
      try {{ node.scrollIntoView({{block: 'center', inline: 'center'}}); }} catch (err) {{}}
      const rect = node.getBoundingClientRect();
      const cx = rect.left + Math.max(4, Math.min(rect.width - 4, rect.width / 2));
      const cy = rect.top + Math.max(4, Math.min(rect.height - 4, rect.height / 2));
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {{
        try {{ node.dispatchEvent(new MouseEvent(type, {{bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, button: 0}})); }} catch (err) {{}}
      }});
      try {{ node.click(); }} catch (err) {{}}
      return true;
    }};
    const focusCaretToEnd = (inputNode) => {{
      try {{ inputNode.scrollIntoView({{block: 'center', inline: 'nearest'}}); }} catch (err) {{}}
      try {{ inputNode.focus(); }} catch (err) {{}}
      try {{
        const selection = window.getSelection();
        if (selection) {{
          selection.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(inputNode);
          range.collapse(false);
          selection.addRange(range);
        }}
      }} catch (err) {{}}
      try {{ document.dispatchEvent(new Event('selectionchange', {{bubbles: true}})); }} catch (err) {{}}
      try {{ inputNode.dispatchEvent(new FocusEvent('focus', {{bubbles: false, relatedTarget: null}})); }} catch (err) {{}}
      try {{ inputNode.dispatchEvent(new FocusEvent('focusin', {{bubbles: true, relatedTarget: null}})); }} catch (err) {{}}
    }};
    const fireKeyboardTrip = (inputNode, key, code) => {{
      ['keydown', 'keypress', 'keyup'].forEach((type) => {{
        try {{ inputNode.dispatchEvent(new KeyboardEvent(type, {{bubbles: true, cancelable: true, composed: true, key, code, charCode: key.length === 1 ? key.charCodeAt(0) : 0, keyCode: key.length === 1 ? key.charCodeAt(0) : 0, which: key.length === 1 ? key.charCodeAt(0) : 0}})); }} catch (err) {{}}
      }});
    }};
    const fireInputEvents = (inputNode, data, inputType) => {{
      try {{ inputNode.dispatchEvent(new InputEvent('beforeinput', {{bubbles: true, cancelable: true, composed: true, data, inputType}})); }} catch (e) {{}}
      try {{ inputNode.dispatchEvent(new InputEvent('input', {{bubbles: true, composed: true, data, inputType}})); }} catch (e) {{ try {{ inputNode.dispatchEvent(new Event('input', {{bubbles: true}})); }} catch (e2) {{}} }}
      try {{ inputNode.dispatchEvent(new Event('change', {{bubbles: true}})); }} catch (e) {{}}
    }};
    const dispatchNativeInput = (inputNode, data, inputType = 'insertText') => {{
      try {{ inputNode.dispatchEvent(new InputEvent('beforeinput', {{bubbles: true, cancelable: true, composed: true, data, inputType}})); }} catch (e) {{}}
      try {{ inputNode.dispatchEvent(new InputEvent('input', {{bubbles: true, composed: true, data, inputType}})); }} catch (e) {{ try {{ inputNode.dispatchEvent(new Event('input', {{bubbles: true}})); }} catch (e2) {{}} }}
    }};
    const selectAllEditableText = (inputNode) => {{
      focusCaretToEnd(inputNode);
      try {{
        const selection = window.getSelection();
        if (!selection) return false;
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(inputNode);
        selection.addRange(range);
        try {{ document.dispatchEvent(new Event('selectionchange', {{bubbles: true}})); }} catch (err) {{}}
        return true;
      }} catch (err) {{ return false; }}
    }};
    const execInsertText = (inputNode, value) => {{
      try {{
        focusCaretToEnd(inputNode);
        if (document.queryCommandSupported && !document.queryCommandSupported('insertText')) return false;
        const ok = document.execCommand('insertText', false, value);
        if (ok) dispatchNativeInput(inputNode, value, 'insertText');
        return !!ok;
      }} catch (err) {{ return false; }}
    }};
    const execDeleteSelection = (inputNode) => {{
      try {{
        if (document.queryCommandSupported && document.queryCommandSupported('delete')) {{
          const ok = document.execCommand('delete', false, null);
          if (ok) dispatchNativeInput(inputNode, '', 'deleteContentBackward');
          return !!ok;
        }}
      }} catch (err) {{}}
      return false;
    }};
    const visualHoldReplaceText = (inputNode, value) => {{
      // V60: editor persistence first. Avoid beforeinput/input/change/keyboard
      // events and execCommand. V59 diagnostics showed the reply wrapper being
      // removed shortly after synthetic input enabled the send button. This path
      // only writes visible DOM text into the contenteditable editor and keeps
      // focus/caret; button activation is intentionally postponed.
      try {{ inputNode.focus({{preventScroll: true}}); }} catch (err) {{ try {{ inputNode.focus(); }} catch (err2) {{}} }}
      try {{
        while (inputNode.firstChild) inputNode.removeChild(inputNode.firstChild);
        inputNode.appendChild(document.createTextNode(value || ''));
      }} catch (err) {{
        try {{ inputNode.textContent = value || ''; }} catch (err2) {{}}
      }}
      try {{
        const selection = window.getSelection();
        if (selection) {{
          selection.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(inputNode);
          range.collapse(false);
          selection.addRange(range);
        }}
      }} catch (err) {{}}
      try {{ inputNode.setAttribute('data-ucp-visual-hold', '1'); }} catch (err) {{}}
      try {{ inputNode.setAttribute('data-ucp-visual-hold-text-length', String((value || '').length)); }} catch (err) {{}}
      return 'visual_text_node_hold_no_events';
    }};
    const nativeReplaceText = (inputNode, value) => {{
      return visualHoldReplaceText(inputNode, value);
    }};
    const nativeHumanNudge = (inputNode, expectedValue) => {{
      // V60: no reactivation. Only repair visible DOM text if it was lost.
      try {{ inputNode.focus({{preventScroll: true}}); }} catch (err) {{}}
      if (expectedValue && textOf(inputNode) !== expectedValue) {{
        return visualHoldReplaceText(inputNode, expectedValue);
      }}
      return 'reactivation_disabled_visual_text_hold';
    }};
    const nativeInputPath = (inputNode, value, mode) => {{
      focusCaretToEnd(inputNode);
      if (mode === 'reactivate') {{
        return nativeHumanNudge(inputNode, value);
      }}
      return nativeReplaceText(inputNode, value);
    }};
    const findLocalReplyEditor = (host) => {{
      if (!host || !(host instanceof Element)) return null;
      const candidates = [host, ...Array.from(host.querySelectorAll('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6'))]
        .filter((node, index, arr) => node instanceof Element && arr.indexOf(node) === index)
        .filter(visible);
      for (const node of candidates) {{
        const inputNode = node.matches?.('.input-d24X73[contenteditable="true"], .textarea-NCe55j, textarea, [contenteditable="true"]')
          ? node
          : node.querySelector('.input-d24X73[contenteditable="true"], .textarea-NCe55j, textarea, [contenteditable="true"]');
        if (!inputNode || !visible(inputNode)) continue;
        const placeholder = inputNode.getAttribute('placeholder') || inputNode.getAttribute('aria-placeholder') || '';
        const footer = node.querySelector('.footer-oZJTJd') || node.closest('.wrap-NeUN4f')?.querySelector('.footer-oZJTJd') || node;
        const sendNode = Array.from(footer.querySelectorAll('button, [role="button"], span, div')).find((el) => visible(el) && textOf(el) === '发送') || null;
        const cancelNode = Array.from(footer.querySelectorAll('button, [role="button"], span, div')).find((el) => visible(el) && textOf(el) === '取消') || null;
        const replyWrapper = inputNode.closest('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6');
        const isReplyScoped = placeholder.startsWith('回复') || !!cancelNode || !!sendNode || !!replyWrapper;
        const inTopComposerOnly = !!inputNode.closest('.content-wWJcbN') && !replyWrapper && !cancelNode && !sendNode && !placeholder.startsWith('回复');
        if (isReplyScoped && !inTopComposerOnly) {{
          const editorNode = (node === inputNode)
            ? (replyWrapper || inputNode.parentElement || inputNode)
            : node;
          const editorFooter = editorNode.querySelector?.('.footer-oZJTJd') || editorNode.closest?.('.wrap-NeUN4f')?.querySelector?.('.footer-oZJTJd') || editorNode;
          const editorSendNode = Array.from(editorFooter.querySelectorAll?.('button, [role="button"], span, div') || []).find((el) => visible(el) && textOf(el) === '发送') || sendNode || null;
          const editorCancelNode = Array.from(editorFooter.querySelectorAll?.('button, [role="button"], span, div') || []).find((el) => visible(el) && textOf(el) === '取消') || cancelNode || null;
          return {{node: editorNode, inputNode, sendNode: editorSendNode, cancelNode: editorCancelNode, placeholder}};
        }}
      }}
      return null;
    }};
    const topCards = Array.from(document.querySelectorAll('.container-sXKyMs')).filter((card) => visible(card) && !card.closest('.reply-list-QwXCb_'));
    const mappedThreads = topCards.map((card) => {{
      const authorNode = card.querySelector('.username-aLgaNB');
      const timeNode = card.querySelector('.time-NRtTXO');
      const contentNode = card.querySelector('.comment-content-text-JvmAKq');
      const authorName = ownText(authorNode, ['.tag-DAEcKE']);
      const timeText = textOf(timeNode);
      const contentText = extractCommentContent(card, authorName, timeText).slice(0, 200);
      const threadHost = card.parentElement || card;
      const editor = findLocalReplyEditor(threadHost);
      return {{
        card,
        threadHost,
        author: authorName,
        content: contentText,
        threadKey: [authorName, timeText, contentText.slice(0, 80)].join(' | '),
        editor,
      }};
    }});
    const txn = (window.__ucpCommentReplyTransaction && typeof window.__ucpCommentReplyTransaction === 'object') ? window.__ucpCommentReplyTransaction : null;
    const txnMatches = !!(txn && (
      (payload.replyDomKey && txn.replyDomKey === payload.replyDomKey)
      || (payload.targetMessageKey && txn.targetMessageKey === payload.targetMessageKey)
    ));
    let registryEntry = null;
    try {{ const registry = window.__ucpCommentReplyRegistry; if (registry && typeof registry.get === 'function' && payload.replyDomKey) registryEntry = registry.get(payload.replyDomKey) || null; }} catch (_) {{ registryEntry = null; }}
    const exactRootCard = txnMatches && txn.rootCard instanceof Element && txn.rootCard.isConnected
      ? txn.rootCard
      : (registryEntry && registryEntry.rootCard instanceof Element && registryEntry.rootCard.isConnected ? registryEntry.rootCard : null);
    const exactTargetCard = txnMatches && txn.targetCard instanceof Element && txn.targetCard.isConnected
      ? txn.targetCard
      : (registryEntry && registryEntry.card instanceof Element && registryEntry.card.isConnected ? registryEntry.card : null);
    let resolvedBy = 'thread_exact';
    let target = exactRootCard ? mappedThreads.find((item) => item.card === exactRootCard && item.editor) || null : null;
    if (target) resolvedBy = txnMatches ? 'active_transaction_root_editor' : 'reply_registry_root_editor';
    if (!target) target = mappedThreads.find((item) => payload.threadKey && item.threadKey === payload.threadKey && item.editor) || null;
    if (!target && !payload.replyDomKey && !payload.targetMessageKey) target = mappedThreads.find((item) => item.author === payload.author && payload.content && item.content === payload.content && item.editor) || null;
    if (!target && !payload.replyDomKey && !payload.targetMessageKey) {{ const authorEditors = mappedThreads.filter((item) => item.author === payload.author && item.editor); if (authorEditors.length === 1) target = authorEditors[0]; }}
    if (txnMatches && txn.editorNode instanceof Element && txn.editorNode.isConnected && visible(txn.editorNode) && txn.inputNode instanceof Element && txn.inputNode.isConnected && visible(txn.inputNode)) {{
      const rootMapped = exactRootCard ? mappedThreads.find((item) => item.card === exactRootCard) : null;
      const footer = txn.editorNode.querySelector?.('.footer-oZJTJd') || txn.editorNode;
      const sendNode = txn.sendNode instanceof Element && txn.sendNode.isConnected ? txn.sendNode : Array.from(footer.querySelectorAll?.('button, [role="button"], span, div') || []).find((el) => visible(el) && textOf(el) === '发送') || null;
      const cancelNode = Array.from(footer.querySelectorAll?.('button, [role="button"], span, div') || []).find((el) => visible(el) && textOf(el) === '取消') || null;
      target = {{...(rootMapped || target || {{}}), card: exactRootCard || (rootMapped && rootMapped.card) || null, threadHost: (rootMapped && rootMapped.threadHost) || txn.editorNode.parentElement || document.body, author: payload.author || (rootMapped && rootMapped.author) || '', content: payload.content || '', threadKey: payload.threadKey || (rootMapped && rootMapped.threadKey) || '', editor: {{node: txn.editorNode, inputNode: txn.inputNode, sendNode, cancelNode, placeholder: txn.inputNode.getAttribute('placeholder') || txn.inputNode.getAttribute('aria-placeholder') || ''}}}};
      resolvedBy = 'active_transaction_editor';
    }}
    if ((!target || !target.editor) && exactTargetCard) {{
      const exactTargetEditor = findLocalReplyEditor(exactTargetCard);
      if (exactTargetEditor) {{
        const rootMapped = exactRootCard ? mappedThreads.find((item) => item.card === exactRootCard) : null;
        target = {{...(rootMapped || target || {{}}), card: exactRootCard || (rootMapped && rootMapped.card) || null, threadHost: (rootMapped && rootMapped.threadHost) || exactTargetCard.parentElement || exactTargetCard, author: payload.author || (rootMapped && rootMapped.author) || '', content: payload.content || '', threadKey: payload.threadKey || (rootMapped && rootMapped.threadKey) || '', editor: exactTargetEditor}};
        resolvedBy = txnMatches ? 'active_transaction_target_editor' : 'reply_registry_target_editor';
      }}
    }}

    const globalEditor = findLocalReplyEditor(document.body);
    const modernPayload = !!(payload.replyDomKey || payload.targetMessageKey);
    const placeholderMatchesAuthor = (editor, authorName) => {{
      const ph = String((editor && editor.placeholder) || '');
      return !!editor && (!authorName || !ph || ph.includes(authorName) || !ph.startsWith('回复'));
    }};
    const globalMappedThread = mappedThreads.find((item) => payload.threadKey && item.threadKey === payload.threadKey)
      || (!modernPayload ? mappedThreads.find((item) => item.author === payload.author && payload.content && item.content === payload.content) : null)
      || (!modernPayload ? mappedThreads.find((item) => item.author === payload.author) : null)
      || null;
    if ((!target || !target.editor) && globalEditor && globalMappedThread && placeholderMatchesAuthor(globalEditor, payload.author) && (!modernPayload || txnMatches)) {{
      target = {{...globalMappedThread, editor: globalEditor, threadHost: globalMappedThread.threadHost || globalEditor.node.parentElement || document.body}};
      resolvedBy = modernPayload ? 'active_transaction_global_editor' : 'legacy_global_editor_attached_to_target_thread';
    }}
    if ((!target || !target.editor) && globalEditor && placeholderMatchesAuthor(globalEditor, payload.author) && !modernPayload) {{
      target = {{card: null, threadHost: globalEditor.node.parentElement || document.body, author: payload.author || '', content: payload.content || '', threadKey: payload.threadKey || [payload.author || '', '', String(payload.content || '').slice(0, 80)].join(' | '), editor: globalEditor}};
      resolvedBy = 'legacy_global_editor_placeholder_match';
    }}
    if (!target && !modernPayload) {{
      const genericEditors = mappedThreads.filter((item) => item.editor);
      target = genericEditors[0] || null;
      resolvedBy = target ? 'legacy_thread_visible' : resolvedBy;
    }}
    if (!target || !target.editor) {{
      return JSON.stringify({{ok: false, action: 'probe_comment_reply_draft', phase: payload.phase, state: modernPayload ? 'target_editor_missing' : 'editor_missing', payload, mappedCount: mappedThreads.length, globalEditorFound: !!globalEditor, globalEditorPlaceholder: globalEditor ? globalEditor.placeholder : '', transactionMatched: txnMatches, transactionState: txn ? txn.state || '' : '', resolvedBy, exactRootFound: !!exactRootCard}});
    }}
    try {{
      if (txnMatches) {{
        txn.rootCard = target.card || exactRootCard || txn.rootCard || null;
        txn.targetCard = exactTargetCard || txn.targetCard || null;
        txn.editorNode = target.editor.node;
        txn.inputNode = target.editor.inputNode;
        txn.sendNode = target.editor.sendNode || null;
        txn.state = 'draft_editor_bound';
        txn.editorBoundAt = Date.now();
        window.__ucpCommentReplyTransaction = txn;
        if (target.editor.node instanceof Element && txn.transactionId) target.editor.node.setAttribute('data-ucp-editor-transaction', txn.transactionId);
      }}
    }} catch (_) {{}}

    const installEditorObserver = (editorNode, threadHost, targetThreadKey) => {{
      try {{
        const key = String(targetThreadKey || payload.threadKey || payload.author || 'active');
        const existing = window.__ucpCommentEditorDiag;
        if (existing && existing.observer && existing.key === key) {{
          return {{installed: true, reused: true, key, eventCount: (existing.events || []).length}};
        }}
        try {{ existing && existing.observer && existing.observer.disconnect(); }} catch (err) {{}}
        const events = [];
        const summarizeNode = (node) => {{
          try {{
            if (!node) return '';
            if (node.nodeType === Node.TEXT_NODE) return '#text:' + String(node.textContent || '').slice(0, 30);
            if (!(node instanceof Element)) return String(node.nodeName || 'node');
            let part = (node.tagName || '').toLowerCase();
            if (node.id) part += '#' + node.id;
            const cls = (typeof node.className === 'string' ? node.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 4);
            if (cls.length) part += '.' + cls.join('.');
            const txt = textOf(node).slice(0, 80);
            return part + (txt ? ' text=' + txt : '');
          }} catch (err) {{ return 'summarize_error:' + String(err).slice(0, 60); }}
        }};
        const containsEditor = (node) => {{
          try {{ return !!node && (node === editorNode || (node instanceof Element && node.contains(editorNode))); }} catch (err) {{ return false; }}
        }};
        const observer = new MutationObserver((mutations) => {{
          for (const m of mutations) {{
            const removed = Array.from(m.removedNodes || []).map(summarizeNode);
            const added = Array.from(m.addedNodes || []).map(summarizeNode);
            const removedEditor = Array.from(m.removedNodes || []).some(containsEditor);
            const addedEditorLike = Array.from(m.addedNodes || []).some((n) => {{
              try {{ return n instanceof Element && !!n.querySelector?.('.input-d24X73[contenteditable="true"], textarea, [contenteditable="true"]'); }} catch (err) {{ return false; }}
            }});
            events.push({{t: Date.now(), type: m.type, target: summarizeNode(m.target), attributeName: m.attributeName || '', removed, added, removedEditor, addedEditorLike}});
            while (events.length > 30) events.shift();
          }}
        }});
        const observeRoot = threadHost || editorNode.parentElement || document.body;
        observer.observe(observeRoot, {{childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']}});
        window.__ucpCommentEditorDiag = {{key, installedAt: Date.now(), observer, events, editorHint: pathHint(editorNode), threadHint: pathHint(threadHost || editorNode)}};
        return {{installed: true, reused: false, key, editorHint: pathHint(editorNode), threadHint: pathHint(threadHost || editorNode)}};
      }} catch (err) {{
        return {{installed: false, error: String(err).slice(0, 160)}};
      }}
    }};

    const editor = target.editor;
    const mutationObserver = installEditorObserver(editor.node, target.threadHost, target.threadKey);
    if (!editor.inputNode) {{
      return JSON.stringify({{ok: false, action: 'probe_comment_reply_draft', phase: payload.phase, state: 'input_missing', payload}});
    }}
    const beforeDisabled = editor.sendNode ? getDisabled(editor.sendNode) : null;
    const beforePreview = textOf(editor.inputNode).slice(0, 120);
    const desiredDraft = beforePreview || payload.draftText;
    let activationMethod = beforePreview ? 'existing_draft' : 'noop';
    const activationTrace = [];
    if (payload.phase === 'stage' && !beforePreview) {{
      activationMethod = nativeInputPath(editor.inputNode, payload.draftText, 'stage');
      activationTrace.push('native_input_path', activationMethod);
    }} else if (payload.phase === 'reactivate') {{
      activationMethod = nativeInputPath(editor.inputNode, desiredDraft, 'reactivate');
      activationTrace.push('native_reactivation_path', activationMethod);
    }} else if (payload.phase === 'verify') {{
      activationMethod = beforePreview ? 'verify_existing_draft' : 'verify_empty';
    }} else if (payload.phase === 'finalize') {{
      activationMethod = beforePreview ? 'finalize_existing_draft' : 'finalize_empty';
    }}
    const draftPreview = textOf(editor.inputNode).slice(0, 120);
    const afterDisabled = editor.sendNode ? getDisabled(editor.sendNode) : null;
    const result = {{
      ok: true,
      action: 'probe_comment_reply_draft',
      phase: payload.phase,
      state: beforePreview ? 'existing_draft_detected' : 'draft_probed',
      payload,
      resolvedBy,
      placeholder: editor.placeholder,
      beforeDisabled,
      afterDisabled,
      sendFound: !!editor.sendNode,
      sendEnabled: afterDisabled === false,
      sendButtonRect: rectOf(editor.sendNode),
      sendButtonCenter: centerOf(editor.sendNode),
      sendButtonHint: pathHint(editor.sendNode),
      inputLength: textOf(editor.inputNode).length,
      draftPreview,
      existingDraftPreview: beforePreview,
      activationMethod,
      activationTrace,
      sendButtonClass: editor.sendNode?.className || '',
      sendButtonAriaDisabled: editor.sendNode?.getAttribute('aria-disabled') || '',
      editorRect: rectOf(editor.node),
      editorHint: pathHint(editor.node),
      mutationObserver,
      mutationEvents: ((window.__ucpCommentEditorDiag && window.__ucpCommentEditorDiag.events) || []).slice(-12),
      threadKey: target.threadKey,
      author: target.author,
      content: target.content,
    }};
    if (payload.phase === 'finalize') {{
      result.cancelClicked = editor.cancelNode ? fireClick(editor.cancelNode) : false;
    }}
    return JSON.stringify(result);
  }} catch (err) {{
    return JSON.stringify({{ok: false, action: 'probe_comment_reply_draft', phase: {phase!r}, state: 'error', error: String(err)}});
  }}
}})();
"""




def build_comment_manual_hold_probe_script(thread_key: str, author: str, content: str, expected_text: str) -> str:
    import json as _json
    payload = _json.dumps({"threadKey": thread_key, "author": author, "content": content, "expectedText": expected_text}, ensure_ascii=False)
    return rf"""
(() => {{
  try {{
    const payload = {payload};
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {{
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.02 && rect.width >= 2 && rect.height >= 2;
    }};
    const rectOf = (el) => {{ if (!el || !(el instanceof Element)) return {{x: 0, y: 0, w: 0, h: 0}}; const r = el.getBoundingClientRect(); return {{x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}}; }};
    const pathHint = (el) => {{
      if (!el || !(el instanceof Element)) return '';
      const parts = []; let cur = el;
      for (let i = 0; i < 6 && cur; i += 1) {{
        let part = (cur.tagName || '').toLowerCase(); if (!part) break; if (cur.id) part += '#' + cur.id;
        const cls = (typeof cur.className === 'string' ? cur.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
        if (cls.length) part += '.' + cls.join('.'); parts.push(part); cur = cur.parentElement;
      }}
      return parts.join(' <- ');
    }};
    const ownText = (el, omitSelectors = []) => {{ if (!el || !(el instanceof Element)) return ''; const clone = el.cloneNode(true); omitSelectors.forEach((sel) => clone.querySelectorAll(sel).forEach((node) => node.remove())); return textOf(clone); }};
    const getDisabled = (btn) => !!btn?.disabled || btn?.getAttribute('aria-disabled') === 'true' || btn?.classList?.contains('semi-button-disabled') || btn?.classList?.contains('douyin-creator-interactive-button-disabled') || btn?.classList?.contains('icon-disabled-P2iZUA');
    const extractCommentContent = (card, authorText = '', timeText = '') => {{
      if (!card || !(card instanceof Element)) return '';
      const direct = Array.from(card.querySelectorAll('.comment-content-text-JvmAKq, [class*="comment-content-text"], [class*="comment-content"], [class*="content-text"], [class*="commentText"]')).map(textOf).find(Boolean);
      if (direct) return direct.slice(0, 240);
      const clone = card.cloneNode(true);
      ['.username-aLgaNB', '[class*="username"]', '.tag-DAEcKE', '[class*="tag-"]', '.time-NRtTXO', '[class*="time-"]', '.operations-WFV7Am', '[class*="operation"]', '.reply-list-QwXCb_', '[class*="reply-list"]', '.reply-content-obcMk0', '.reply-NYBpwz', '.wrap-NeUN4f', '.footer-oZJTJd', '[contenteditable="true"]', 'textarea', 'button'].forEach((sel) => clone.querySelectorAll(sel).forEach((node) => node.remove()));
      let text = textOf(clone); [authorText, timeText, '回复', '点赞', '取消', '发送'].filter(Boolean).forEach((token) => {{ text = text.replace(token, ' '); }});
      return text.replace(/\s+/g, ' ').trim().slice(0, 240);
    }};
    const findLocalReplyEditor = (host) => {{
      if (!host || !(host instanceof Element)) return null;
      const candidates = [host, ...Array.from(host.querySelectorAll('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6'))].filter((node, index, arr) => node instanceof Element && arr.indexOf(node) === index).filter(visible);
      for (const node of candidates) {{
        const inputNode = node.matches?.('.input-d24X73[contenteditable="true"], .textarea-NCe55j, textarea, [contenteditable="true"]') ? node : node.querySelector('.input-d24X73[contenteditable="true"], .textarea-NCe55j, textarea, [contenteditable="true"]');
        if (!inputNode || !visible(inputNode)) continue;
        const placeholder = inputNode.getAttribute('placeholder') || inputNode.getAttribute('aria-placeholder') || '';
        const footer = node.querySelector('.footer-oZJTJd') || node.closest('.wrap-NeUN4f')?.querySelector('.footer-oZJTJd') || node;
        const sendNode = Array.from(footer.querySelectorAll('button, [role="button"], span, div')).find((el) => visible(el) && textOf(el) === '发送') || null;
        const cancelNode = Array.from(footer.querySelectorAll('button, [role="button"], span, div')).find((el) => visible(el) && textOf(el) === '取消') || null;
        const isReplyScoped = placeholder.startsWith('回复') || !!cancelNode || !!sendNode || !!node.closest('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6');
        if (isReplyScoped) {{
          const editorNode = (node === inputNode)
            ? (inputNode.closest('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6') || inputNode.parentElement || inputNode)
            : node;
          const editorFooter = editorNode.querySelector?.('.footer-oZJTJd') || editorNode.closest?.('.wrap-NeUN4f')?.querySelector?.('.footer-oZJTJd') || editorNode;
          const editorSendNode = Array.from(editorFooter.querySelectorAll?.('button, [role="button"], span, div') || []).find((el) => visible(el) && textOf(el) === '发送') || sendNode || null;
          const editorCancelNode = Array.from(editorFooter.querySelectorAll?.('button, [role="button"], span, div') || []).find((el) => visible(el) && textOf(el) === '取消') || cancelNode || null;
          return {{node: editorNode, inputNode, sendNode: editorSendNode, cancelNode: editorCancelNode, placeholder}};
        }}
      }}
      return null;
    }};
    const topCards = Array.from(document.querySelectorAll('.container-sXKyMs')).filter((card) => visible(card) && !card.closest('.reply-list-QwXCb_'));
    const mappedThreads = topCards.map((card) => {{
      const authorNode = card.querySelector('.username-aLgaNB'); const timeNode = card.querySelector('.time-NRtTXO');
      const authorName = ownText(authorNode, ['.tag-DAEcKE']); const timeText = textOf(timeNode);
      const contentText = extractCommentContent(card, authorName, timeText).slice(0, 200); const threadHost = card.parentElement || card; const editor = findLocalReplyEditor(threadHost);
      return {{card, threadHost, author: authorName, content: contentText, threadKey: [authorName, timeText, contentText.slice(0, 80)].join(' | '), editor}};
    }});
    let resolvedBy = 'thread_exact';
    let target = mappedThreads.find((item) => payload.threadKey && item.threadKey === payload.threadKey && item.editor) || mappedThreads.find((item) => item.author === payload.author && payload.content && item.content === payload.content && item.editor) || mappedThreads.find((item) => item.author === payload.author && item.editor) || null;
    const globalEditor = findLocalReplyEditor(document.body);
    const placeholderMatchesAuthor = (editor, authorName) => {{ const ph = String((editor && editor.placeholder) || ''); return !!editor && (!authorName || !ph || ph.includes(authorName) || !ph.startsWith('回复')); }};
    const globalMappedThread = mappedThreads.find((item) => payload.threadKey && item.threadKey === payload.threadKey) || mappedThreads.find((item) => item.author === payload.author && payload.content && item.content === payload.content) || mappedThreads.find((item) => item.author === payload.author) || null;
    if ((!target || !target.editor) && globalEditor && globalMappedThread && placeholderMatchesAuthor(globalEditor, payload.author)) {{ target = {{...globalMappedThread, editor: globalEditor, threadHost: globalMappedThread.threadHost || globalEditor.node.parentElement || document.body}}; resolvedBy = 'global_editor_attached_to_target_thread'; }}
    if ((!target || !target.editor) && globalEditor && placeholderMatchesAuthor(globalEditor, payload.author)) {{ target = {{card: null, threadHost: globalEditor.node.parentElement || document.body, author: payload.author || '', content: payload.content || '', threadKey: payload.threadKey || [payload.author || '', '', String(payload.content || '').slice(0, 80)].join(' | '), editor: globalEditor}}; resolvedBy = 'global_editor_placeholder_match'; }}
    if (!target) {{ const genericEditors = mappedThreads.filter((item) => item.editor); target = genericEditors[0] || null; resolvedBy = target ? 'thread_visible' : resolvedBy; }}
    const diag = window.__ucpCommentEditorDiag || {{}}; const mutationEvents = (diag.events || []).slice(-20); const activeElement = document.activeElement instanceof Element ? document.activeElement : null;
    if (!target || !target.editor || !target.editor.inputNode) {{
      return JSON.stringify({{ok: false, action: 'manual_hold_probe', state: 'editor_missing', editorVisible: false, payload, mappedCount: mappedThreads.length, replyEditorsFound: mappedThreads.filter((item) => item.editor).length + (globalEditor ? 1 : 0), globalEditorFound: !!globalEditor, globalEditorPlaceholder: globalEditor ? globalEditor.placeholder : '', mutationEvents, diagKey: diag.key || '', activeElement: activeElement ? {{tag: (activeElement.tagName || '').toLowerCase(), text: textOf(activeElement).slice(0, 120), hint: pathHint(activeElement)}} : {{}} }});
    }}
    const draftReadback = textOf(target.editor.inputNode); const expected = String(payload.expectedText || '').replace(/\s+/g, ' ').trim(); const afterDisabled = target.editor.sendNode ? getDisabled(target.editor.sendNode) : null;
    return JSON.stringify({{ok: true, action: 'manual_hold_probe', state: 'editor_visible', editorVisible: true, payload, resolvedBy, threadKey: target.threadKey, author: target.author, placeholder: target.editor.placeholder, draftReadback, draftPreview: draftReadback.slice(0, 120), readbackMatched: !!expected && draftReadback === expected, afterDisabled, sendEnabled: afterDisabled === false, editorRect: rectOf(target.editor.node), editorHint: pathHint(target.editor.node), mutationEvents, diagKey: diag.key || '', activeElement: activeElement ? {{tag: (activeElement.tagName || '').toLowerCase(), text: textOf(activeElement).slice(0, 120), hint: pathHint(activeElement)}} : {{}} }});
  }} catch (err) {{ return JSON.stringify({{ok: false, action: 'manual_hold_probe', state: 'error', error: String(err)}}); }}
}})();
"""


def build_comment_send_reply_script(
    thread_key: str,
    author: str,
    content: str,
    expected_text: str,
    *,
    target_message_key: str = "",
    reply_dom_key: str = "",
    target_level: str = "",
    target_index: int = -999,
    target_parent_thread_key: str = "",
) -> str:
    import json as _json
    payload = _json.dumps({
        "threadKey": thread_key,
        "author": author,
        "content": content,
        "expectedText": expected_text,
        "targetMessageKey": target_message_key,
        "replyDomKey": reply_dom_key,
        "targetLevel": target_level,
        "targetIndex": target_index,
        "targetParentThreadKey": target_parent_thread_key,
    }, ensure_ascii=False)
    return rf"""
(() => {{
  try {{
    const payload = {payload};
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {{
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.02 && rect.width >= 2 && rect.height >= 2;
    }};
    const rectOf = (el) => {{
      if (!el || !(el instanceof Element)) return {{x: 0, y: 0, w: 0, h: 0}};
      const r = el.getBoundingClientRect();
      return {{x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}};
    }};
    const pathHint = (el) => {{
      if (!el || !(el instanceof Element)) return '';
      const parts = [];
      let cur = el;
      for (let i = 0; i < 6 && cur; i += 1) {{
        let part = (cur.tagName || '').toLowerCase();
        if (!part) break;
        if (cur.id) part += '#' + cur.id;
        const cls = (typeof cur.className === 'string' ? cur.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
        if (cls.length) part += '.' + cls.join('.');
        parts.push(part);
        cur = cur.parentElement;
      }}
      return parts.join(' <- ');
    }};
    const ownText = (el, omitSelectors = []) => {{
      if (!el || !(el instanceof Element)) return '';
      const clone = el.cloneNode(true);
      omitSelectors.forEach((sel) => clone.querySelectorAll(sel).forEach((node) => node.remove()));
      return textOf(clone);
    }};
    const extractCommentContent = (card, authorText = '', timeText = '') => {{
      if (!card || !(card instanceof Element)) return '';
      const richTextOf = (node) => {{
        if (!node) return '';
        const parts = [];
        const walk = (cur) => {{
          if (!cur) return;
          if (cur.nodeType === Node.TEXT_NODE) {{
            parts.push(cur.textContent || '');
            return;
          }}
          if (!(cur instanceof Element)) return;
          const tag = (cur.tagName || '').toLowerCase();
          if (tag === 'img') {{
            parts.push(cur.getAttribute('alt') || cur.getAttribute('data-type') || cur.getAttribute('title') || cur.getAttribute('aria-label') || '');
            return;
          }}
          if (tag === 'br') {{
            parts.push(' ');
            return;
          }}
          Array.from(cur.childNodes || []).forEach(walk);
        }};
        walk(node);
        return parts.join('').replace(/\s+/g, ' ').trim();
      }};
      const direct = Array.from(card.querySelectorAll('.comment-content-text-JvmAKq, [class*="comment-content-text"], [class*="comment-content"], [class*="content-text"], [class*="commentText"]'))
        .map((node) => richTextOf(node) || textOf(node))
        .find(Boolean);
      if (direct) return direct.slice(0, 240);
      const clone = card.cloneNode(true);
      clone.querySelectorAll('img').forEach((node) => {{
        const token = node.getAttribute('alt') || node.getAttribute('data-type') || node.getAttribute('title') || node.getAttribute('aria-label') || '';
        try {{
          node.replaceWith(document.createTextNode(token));
        }} catch (err) {{}}
      }});
      [
        '.username-aLgaNB', '[class*="username"]', '.tag-DAEcKE', '[class*="tag-"]',
        '.time-NRtTXO', '[class*="time-"]', '.operations-WFV7Am', '[class*="operation"]',
        '.reply-list-QwXCb_', '[class*="reply-list"]', '.reply-content-obcMk0', '.reply-NYBpwz',
        '.wrap-NeUN4f', '.footer-oZJTJd', '[contenteditable="true"]', 'textarea', 'button',
        '.douyin-creator-interactive-popover', '.douyin-creator-interactive-select',
      ].forEach((sel) => clone.querySelectorAll(sel).forEach((node) => node.remove()));
      let text = richTextOf(clone) || textOf(clone);
      [authorText, timeText, '回复', '点赞', '取消', '发送'].filter(Boolean).forEach((token) => {{
        text = text.replace(token, ' ');
      }});
      return text.replace(/\s+/g, ' ').trim().slice(0, 240);
    }};
    const getDisabled = (btn) => !!btn?.disabled || btn?.getAttribute('aria-disabled') === 'true' || btn?.classList?.contains('semi-button-disabled') || btn?.classList?.contains('douyin-creator-interactive-button-disabled') || btn?.classList?.contains('icon-disabled-P2iZUA');
    const fireClick = (node) => {{
      if (!node || !(node instanceof Element)) return false;
      try {{ node.scrollIntoView({{block: 'center', inline: 'center'}}); }} catch (err) {{}}
      const rect = node.getBoundingClientRect();
      const cx = rect.left + Math.max(4, Math.min(rect.width - 4, rect.width / 2));
      const cy = rect.top + Math.max(4, Math.min(rect.height - 4, rect.height / 2));
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {{
        try {{ node.dispatchEvent(new MouseEvent(type, {{bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, button: 0}})); }} catch (err) {{}}
      }});
      try {{ node.click(); }} catch (err) {{}}
      return true;
    }};
    const focusCaretToEnd = (inputNode) => {{
      try {{ inputNode.scrollIntoView({{block: 'center', inline: 'nearest'}}); }} catch (err) {{}}
      try {{ inputNode.focus(); }} catch (err) {{}}
      try {{
        const selection = window.getSelection();
        if (selection) {{
          selection.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(inputNode);
          range.collapse(false);
          selection.addRange(range);
        }}
      }} catch (err) {{}}
      try {{ document.dispatchEvent(new Event('selectionchange', {{bubbles: true}})); }} catch (err) {{}}
      try {{ inputNode.dispatchEvent(new FocusEvent('focusin', {{bubbles: true, relatedTarget: null}})); }} catch (err) {{}}
    }};
    const fireKeyboardTrip = (inputNode, key, code) => {{
      ['keydown', 'keypress', 'keyup'].forEach((type) => {{
        try {{ inputNode.dispatchEvent(new KeyboardEvent(type, {{bubbles: true, cancelable: true, composed: true, key, code, charCode: key.length === 1 ? key.charCodeAt(0) : 0, keyCode: key.length === 1 ? key.charCodeAt(0) : 0, which: key.length === 1 ? key.charCodeAt(0) : 0}})); }} catch (err) {{}}
      }});
    }};
    const fireInputEvents = (inputNode, data, inputType) => {{
      try {{ inputNode.dispatchEvent(new InputEvent('beforeinput', {{bubbles: true, cancelable: true, composed: true, data, inputType}})); }} catch (e) {{}}
      try {{ inputNode.dispatchEvent(new InputEvent('input', {{bubbles: true, composed: true, data, inputType}})); }} catch (e) {{ try {{ inputNode.dispatchEvent(new Event('input', {{bubbles: true}})); }} catch (e2) {{}} }}
      try {{ inputNode.dispatchEvent(new Event('change', {{bubbles: true}})); }} catch (e) {{}}
    }};
    const clearInputNode = (inputNode) => {{
      try {{ inputNode.innerHTML = ''; }} catch (err) {{}}
      try {{ inputNode.textContent = ''; }} catch (err) {{}}
      fireInputEvents(inputNode, '', 'deleteByCut');
    }};
    const tryExecCommandInsert = (inputNode, value) => {{
      try {{
        focusCaretToEnd(inputNode);
        if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {{
          document.execCommand('selectAll', false, null);
          document.execCommand('delete', false, null);
          return !!document.execCommand('insertText', false, value);
        }}
      }} catch (err) {{}}
      return false;
    }};
    const tryRangeInsert = (inputNode, value) => {{
      try {{
        focusCaretToEnd(inputNode);
        const selection = window.getSelection();
        if (!selection) return false;
        if (!selection.rangeCount) {{
          const range = document.createRange();
          range.selectNodeContents(inputNode);
          range.collapse(false);
          selection.addRange(range);
        }}
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(value);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      }} catch (err) {{}}
      return false;
    }};
    const preserveText = (inputNode, value) => {{
      if (textOf(inputNode) === value) return;
      try {{ inputNode.textContent = value; }} catch (err) {{}}
      fireInputEvents(inputNode, value, 'insertText');
    }};
    const reactiveNudge = (inputNode, value) => {{
      focusCaretToEnd(inputNode);
      fireKeyboardTrip(inputNode, 'Process', 'Process');
      try {{ inputNode.dispatchEvent(new CompositionEvent('compositionstart', {{bubbles: true, data: ''}})); }} catch (err) {{}}
      try {{ inputNode.dispatchEvent(new CompositionEvent('compositionupdate', {{bubbles: true, data: value}})); }} catch (err) {{}}
      try {{ inputNode.dispatchEvent(new CompositionEvent('compositionend', {{bubbles: true, data: value}})); }} catch (err) {{}}
      fireInputEvents(inputNode, value, 'insertCompositionText');
      fireKeyboardTrip(inputNode, value.slice(-1) || 'a', 'KeyA');
      fireKeyboardTrip(inputNode, ' ', 'Space');
      fireInputEvents(inputNode, ' ', 'insertText');
      fireKeyboardTrip(inputNode, 'Backspace', 'Backspace');
      fireInputEvents(inputNode, value, 'deleteContentBackward');
      focusCaretToEnd(inputNode);
      fireInputEvents(inputNode, value, 'insertText');
      try {{ document.dispatchEvent(new Event('selectionchange', {{bubbles: true}})); }} catch (err) {{}}
    }};
    const deepReactiveRewrite = (inputNode, value) => {{
      clearInputNode(inputNode);
      let method = 'rewrite_noop';
      let inserted = tryExecCommandInsert(inputNode, value);
      if (inserted) method = 'rewrite_exec_command';
      if (textOf(inputNode) !== value) {{
        inserted = tryRangeInsert(inputNode, value);
        if (inserted) method = 'rewrite_range_insert';
      }}
      if (textOf(inputNode) !== value) {{
        preserveText(inputNode, value);
        method = 'rewrite_text_content';
      }}
      reactiveNudge(inputNode, value);
      preserveText(inputNode, value);
      return method;
    }};
    const findLocalReplyEditor = (host) => {{
      if (!host || !(host instanceof Element)) return null;
      const candidates = [host, ...Array.from(host.querySelectorAll('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6'))]
        .filter((node, index, arr) => node instanceof Element && arr.indexOf(node) === index)
        .filter(visible);
      for (const node of candidates) {{
        const inputNode = node.matches?.('.input-d24X73[contenteditable="true"], .textarea-NCe55j, textarea, [contenteditable="true"]')
          ? node
          : node.querySelector('.input-d24X73[contenteditable="true"], .textarea-NCe55j, textarea, [contenteditable="true"]');
        if (!inputNode || !visible(inputNode)) continue;
        const placeholder = inputNode.getAttribute('placeholder') || inputNode.getAttribute('aria-placeholder') || '';
        const footer = node.querySelector('.footer-oZJTJd') || node.closest('.wrap-NeUN4f')?.querySelector('.footer-oZJTJd') || node;
        const sendNode = Array.from(footer.querySelectorAll('button, [role="button"], span, div')).find((el) => visible(el) && textOf(el) === '发送') || null;
        const cancelNode = Array.from(footer.querySelectorAll('button, [role="button"], span, div')).find((el) => visible(el) && textOf(el) === '取消') || null;
        const replyWrapper = inputNode.closest('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6');
        const isReplyScoped = placeholder.startsWith('回复') || !!cancelNode || !!sendNode || !!replyWrapper;
        const inTopComposerOnly = !!inputNode.closest('.content-wWJcbN') && !replyWrapper && !cancelNode && !sendNode && !placeholder.startsWith('回复');
        if (isReplyScoped && !inTopComposerOnly) {{
          const editorNode = (node === inputNode)
            ? (replyWrapper || inputNode.parentElement || inputNode)
            : node;
          const editorFooter = editorNode.querySelector?.('.footer-oZJTJd') || editorNode.closest?.('.wrap-NeUN4f')?.querySelector?.('.footer-oZJTJd') || editorNode;
          const editorSendNode = Array.from(editorFooter.querySelectorAll?.('button, [role="button"], span, div') || []).find((el) => visible(el) && textOf(el) === '发送') || sendNode || null;
          const editorCancelNode = Array.from(editorFooter.querySelectorAll?.('button, [role="button"], span, div') || []).find((el) => visible(el) && textOf(el) === '取消') || cancelNode || null;
          return {{node: editorNode, inputNode, sendNode: editorSendNode, cancelNode: editorCancelNode, placeholder}};
        }}
      }}
      return null;
    }};
    const topCards = Array.from(document.querySelectorAll('.container-sXKyMs')).filter((card) => visible(card) && !card.closest('.reply-list-QwXCb_'));
    const mappedThreads = topCards.map((card) => {{
      const authorNode = card.querySelector('.username-aLgaNB');
      const timeNode = card.querySelector('.time-NRtTXO');
      const contentNode = card.querySelector('.comment-content-text-JvmAKq');
      const authorName = ownText(authorNode, ['.tag-DAEcKE']);
      const timeText = textOf(timeNode);
      const contentText = extractCommentContent(card, authorName, timeText).slice(0, 200);
      const threadHost = card.parentElement || card;
      const editor = findLocalReplyEditor(threadHost);
      return {{
        card,
        threadHost,
        author: authorName,
        content: contentText,
        timeText,
        threadKey: [authorName, timeText, contentText.slice(0, 80)].join(' | '),
        editor,
      }};
    }});
    const txn = (window.__ucpCommentReplyTransaction && typeof window.__ucpCommentReplyTransaction === 'object') ? window.__ucpCommentReplyTransaction : null;
    const txnMatches = !!(txn && (
      (payload.replyDomKey && txn.replyDomKey === payload.replyDomKey)
      || (payload.targetMessageKey && txn.targetMessageKey === payload.targetMessageKey)
    ));
    let registryEntry = null;
    try {{ const registry = window.__ucpCommentReplyRegistry; if (registry && typeof registry.get === 'function' && payload.replyDomKey) registryEntry = registry.get(payload.replyDomKey) || null; }} catch (_) {{ registryEntry = null; }}
    const exactRootCard = txnMatches && txn.rootCard instanceof Element && txn.rootCard.isConnected
      ? txn.rootCard
      : (registryEntry && registryEntry.rootCard instanceof Element && registryEntry.rootCard.isConnected ? registryEntry.rootCard : null);
    const exactTargetCard = txnMatches && txn.targetCard instanceof Element && txn.targetCard.isConnected
      ? txn.targetCard
      : (registryEntry && registryEntry.card instanceof Element && registryEntry.card.isConnected ? registryEntry.card : null);
    let target = exactRootCard ? mappedThreads.find((item) => item.card === exactRootCard && item.editor) || null : null;
    let resolvedBy = target ? (txnMatches ? 'active_transaction_root_editor' : 'reply_registry_root_editor') : '';
    if (!target) target = mappedThreads.find((item) => payload.threadKey && item.threadKey === payload.threadKey && item.editor) || null;
    if (!target && !payload.replyDomKey && !payload.targetMessageKey) target = mappedThreads.find((item) => item.author === payload.author && payload.content && item.content === payload.content && item.editor) || null;
    if (!target && !payload.replyDomKey && !payload.targetMessageKey) {{ const authorEditors = mappedThreads.filter((item) => item.author === payload.author && item.editor); if (authorEditors.length === 1) target = authorEditors[0]; }}
    if (txnMatches && txn.editorNode instanceof Element && txn.editorNode.isConnected && visible(txn.editorNode) && txn.inputNode instanceof Element && txn.inputNode.isConnected && visible(txn.inputNode)) {{
      const rootMapped = exactRootCard ? mappedThreads.find((item) => item.card === exactRootCard) : null;
      const footer = txn.editorNode.querySelector?.('.footer-oZJTJd') || txn.editorNode;
      const sendNode = txn.sendNode instanceof Element && txn.sendNode.isConnected ? txn.sendNode : Array.from(footer.querySelectorAll?.('button, [role="button"], span, div') || []).find((el) => visible(el) && textOf(el) === '发送') || null;
      const cancelNode = Array.from(footer.querySelectorAll?.('button, [role="button"], span, div') || []).find((el) => visible(el) && textOf(el) === '取消') || null;
      target = {{...(rootMapped || target || {{}}), card: exactRootCard || (rootMapped && rootMapped.card) || null, threadHost: (rootMapped && rootMapped.threadHost) || txn.editorNode.parentElement || document.body, author: payload.author || (rootMapped && rootMapped.author) || '', content: payload.content || '', threadKey: payload.threadKey || (rootMapped && rootMapped.threadKey) || '', editor: {{node: txn.editorNode, inputNode: txn.inputNode, sendNode, cancelNode, placeholder: txn.inputNode.getAttribute('placeholder') || txn.inputNode.getAttribute('aria-placeholder') || ''}}}};
      resolvedBy = 'active_transaction_editor';
    }}
    if ((!target || !target.editor) && exactTargetCard) {{
      const exactTargetEditor = findLocalReplyEditor(exactTargetCard);
      if (exactTargetEditor) {{
        const rootMapped = exactRootCard ? mappedThreads.find((item) => item.card === exactRootCard) : null;
        target = {{...(rootMapped || target || {{}}), card: exactRootCard || (rootMapped && rootMapped.card) || null, threadHost: (rootMapped && rootMapped.threadHost) || exactTargetCard.parentElement || exactTargetCard, author: payload.author || (rootMapped && rootMapped.author) || '', content: payload.content || '', threadKey: payload.threadKey || (rootMapped && rootMapped.threadKey) || '', editor: exactTargetEditor}};
        resolvedBy = txnMatches ? 'active_transaction_target_editor' : 'reply_registry_target_editor';
      }}
    }}
    const globalEditor = findLocalReplyEditor(document.body);
    const modernPayload = !!(payload.replyDomKey || payload.targetMessageKey);
    const placeholderMatchesAuthor = (editor, authorName) => {{ const ph = String((editor && editor.placeholder) || ''); return !!editor && (!authorName || !ph || ph.includes(authorName) || !ph.startsWith('回复')); }};
    const globalMappedThread = mappedThreads.find((item) => payload.threadKey && item.threadKey === payload.threadKey)
      || (!modernPayload ? mappedThreads.find((item) => item.author === payload.author && payload.content && item.content === payload.content) : null)
      || (!modernPayload ? mappedThreads.find((item) => item.author === payload.author) : null)
      || null;
    if ((!target || !target.editor) && globalEditor && globalMappedThread && placeholderMatchesAuthor(globalEditor, payload.author) && (!modernPayload || txnMatches)) {{
      target = {{...globalMappedThread, editor: globalEditor, threadHost: globalMappedThread.threadHost || globalEditor.node.parentElement || document.body}};
      resolvedBy = modernPayload ? 'active_transaction_global_editor' : 'legacy_global_editor_attached_to_exact_thread';
    }}
    if ((!target || !target.editor) && globalEditor && placeholderMatchesAuthor(globalEditor, payload.author) && !payload.replyDomKey && !payload.targetMessageKey) {{
      target = {{card: null, threadHost: globalEditor.node.parentElement || document.body, author: payload.author || '', content: payload.content || '', threadKey: payload.threadKey || [payload.author || '', '', String(payload.content || '').slice(0, 80)].join(' | '), editor: globalEditor}};
      resolvedBy = 'legacy_global_editor_placeholder_match';
    }}
    if (!target || !target.editor) {{
      return JSON.stringify({{ok: false, action: 'send_comment_reply', state: 'target_editor_missing', payload, mappedCount: mappedThreads.length, globalEditorFound: !!globalEditor, globalEditorPlaceholder: globalEditor ? globalEditor.placeholder : '', transactionMatched: txnMatches, transactionState: txn ? txn.state || '' : '', resolvedBy}});
    }}
    try {{
      if (txnMatches) {{
        txn.rootCard = target.card || exactRootCard || txn.rootCard || null;
        txn.targetCard = exactTargetCard || txn.targetCard || null;
        txn.editorNode = target.editor.node;
        txn.inputNode = target.editor.inputNode;
        txn.sendNode = target.editor.sendNode || null;
        txn.editorDomKey = txn.editorDomKey || ('ucp_editor_' + String(txn.transactionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(-48));
        txn.state = 'send_editor_bound';
        window.__ucpCommentReplyTransaction = txn;
        if (target.editor.node instanceof Element && txn.transactionId) target.editor.node.setAttribute('data-ucp-editor-transaction', txn.transactionId);
        if (target.editor.node instanceof Element && txn.editorDomKey) target.editor.node.setAttribute('data-ucp-editor-dom-key', txn.editorDomKey);
      }}
    }} catch (_) {{}}
    const editor = target.editor;
    const sendNode = editor.sendNode;
    const sendClickable = sendNode && (sendNode.closest?.('button, [role="button"]') || sendNode);
    if (!sendNode || !sendClickable) {{
      return JSON.stringify({{ok: false, action: 'send_comment_reply', state: 'send_button_missing', payload}});
    }}
    const normalizedExpected = String(payload.expectedText || '').replace(/\s+/g, ' ').trim();
    let inputPreview = textOf(editor.inputNode).slice(0, 120);
    let normalizedInput = inputPreview.replace(/\s+/g, ' ').trim();
    let activationMethod = 'direct_send';
    if (!normalizedExpected) {{
      return JSON.stringify({{ok: false, action: 'send_comment_reply', state: 'expected_text_missing', author: target.author, threadKey: target.threadKey}});
    }}
    if (normalizedInput !== normalizedExpected) {{
      activationMethod = deepReactiveRewrite(editor.inputNode, normalizedExpected);
      inputPreview = textOf(editor.inputNode).slice(0, 120);
      normalizedInput = inputPreview.replace(/\s+/g, ' ').trim();
    }}
    if (normalizedInput !== normalizedExpected) {{
      return JSON.stringify({{
        ok: false,
        action: 'send_comment_reply',
        state: 'draft_mismatch',
        author: target.author,
        threadKey: target.threadKey,
        inputPreview,
        expectedText: payload.expectedText,
        activationMethod,
        editorHint: pathHint(editor.node),
      }});
    }}
    let beforeDisabled = getDisabled(sendClickable) || getDisabled(sendNode);
    const sendRect = rectOf(sendClickable);
    const clickPoint = {{x: Math.round(sendRect.x + sendRect.w / 2), y: Math.round(sendRect.y + sendRect.h / 2)}};
    if (beforeDisabled) {{
      // 真实发送阶段不再通过 JS 重写/合成键盘事件强行激活，避免评论编辑器被 React 识别为异常状态后收起。
      // Python 侧会使用 Qt 原生 Space+Backspace 激活一次，再回到这里确认按钮状态。
      return JSON.stringify({{
        ok: false,
        action: 'send_comment_reply',
        state: 'send_button_disabled',
        author: target.author,
        threadKey: target.threadKey,
        inputPreview,
        beforeDisabled,
        activationMethod: 'wait_qt_native_input_activation',
        sendButtonClass: sendClickable.className || sendNode.className || '',
        sendButtonAriaDisabled: sendClickable.getAttribute('aria-disabled') || sendNode.getAttribute('aria-disabled') || '',
        editorRect: rectOf(editor.node),
        editorHint: pathHint(editor.node),
        sendButtonRect: sendRect,
        clickPoint,
        resolvedBy,
        transactionMatched: txnMatches,
        transactionId: txnMatches ? (txn.transactionId || '') : '',
        editorDomKey: txnMatches ? (txn.editorDomKey || '') : '',
      }});
    }}
    // P0: 发送按钮已启用时优先在页面上下文精确触发按钮自身事件。
    // 之前仅把坐标返回给 Qt 视图级点击，实际在部分 DPI/缩放/滚动状态下会点偏，导致编辑器关闭但评论未发送。
    const clicked = fireClick(sendClickable);
    return JSON.stringify({{
      ok: !!clicked,
      action: 'send_comment_reply',
      state: clicked ? 'send_clicked' : 'send_ready',
      author: target.author,
      threadKey: target.threadKey,
      inputPreview,
      beforeDisabled,
      afterDisabled: getDisabled(sendClickable) || getDisabled(sendNode),
      activationMethod: clicked ? 'page_context_send_button_click' : 'qt_view_click_required',
      editorRect: rectOf(editor.node),
      editorHint: pathHint(editor.node),
      sendButtonRect: sendRect,
      clickPoint,
      sendHint: pathHint(sendClickable),
      resolvedBy,
      transactionMatched: txnMatches,
      transactionId: txnMatches ? (txn.transactionId || '') : '',
      editorDomKey: txnMatches ? (txn.editorDomKey || '') : '',
    }});
  }} catch (err) {{
    return JSON.stringify({{ok: false, action: 'send_comment_reply', state: 'error', error: String(err)}});
  }}
}})();
"""


def build_comment_send_click_plan_script(thread_key: str, author: str, content: str, expected_text: str) -> str:
    """Return a one-shot dry-run send click plan.

    The generated JavaScript only locates the matched reply editor and its send
    button. It never dispatches pointer/mouse events, never focuses the button,
    and never calls click().
    """
    import json as _json
    payload = _json.dumps({"threadKey": thread_key, "author": author, "content": content, "expectedText": expected_text}, ensure_ascii=False)
    return rf"""
(() => {{
  try {{
    const payload = {payload};
    const textOf = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {{
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.02 && rect.width >= 2 && rect.height >= 2;
    }};
    const rectOf = (el) => {{
      if (!el || !(el instanceof Element)) return {{x: 0, y: 0, w: 0, h: 0}};
      const r = el.getBoundingClientRect();
      return {{x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}};
    }};
    const centerOf = (el) => {{
      const r = rectOf(el);
      return {{x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2)}};
    }};
    const pathHint = (el) => {{
      if (!el || !(el instanceof Element)) return '';
      const parts = []; let cur = el;
      for (let i = 0; i < 6 && cur; i += 1) {{
        let part = (cur.tagName || '').toLowerCase(); if (!part) break; if (cur.id) part += '#' + cur.id;
        const cls = (typeof cur.className === 'string' ? cur.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
        if (cls.length) part += '.' + cls.join('.'); parts.push(part); cur = cur.parentElement;
      }}
      return parts.join(' <- ');
    }};
    const ownText = (el, omitSelectors = []) => {{
      if (!el || !(el instanceof Element)) return '';
      const clone = el.cloneNode(true);
      omitSelectors.forEach((sel) => clone.querySelectorAll(sel).forEach((node) => node.remove()));
      return textOf(clone);
    }};
    const disabledOf = (btn) => !!btn?.disabled || btn?.getAttribute('aria-disabled') === 'true' || btn?.classList?.contains('semi-button-disabled') || btn?.classList?.contains('douyin-creator-interactive-button-disabled') || btn?.classList?.contains('icon-disabled-P2iZUA');
    const extractCommentContent = (card, authorText = '', timeText = '') => {{
      if (!card || !(card instanceof Element)) return '';
      const direct = Array.from(card.querySelectorAll('.comment-content-text-JvmAKq, [class*="comment-content-text"], [class*="comment-content"], [class*="content-text"], [class*="commentText"]')).map(textOf).find(Boolean);
      if (direct) return direct.slice(0, 240);
      const clone = card.cloneNode(true);
      ['.username-aLgaNB', '[class*="username"]', '.tag-DAEcKE', '[class*="tag-"]', '.time-NRtTXO', '[class*="time-"]', '.operations-WFV7Am', '[class*="operation"]', '.reply-list-QwXCb_', '[class*="reply-list"]', '.reply-content-obcMk0', '.reply-NYBpwz', '.wrap-NeUN4f', '.footer-oZJTJd', '[contenteditable="true"]', 'textarea', 'button'].forEach((sel) => clone.querySelectorAll(sel).forEach((node) => node.remove()));
      let text = textOf(clone); [authorText, timeText, '回复', '点赞', '取消', '发送'].filter(Boolean).forEach((token) => {{ text = text.replace(token, ' '); }});
      return text.replace(/\s+/g, ' ').trim().slice(0, 240);
    }};
    const findLocalReplyEditor = (host) => {{
      if (!host || !(host instanceof Element)) return null;
      const candidates = [host, ...Array.from(host.querySelectorAll('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6'))].filter((node, index, arr) => node instanceof Element && arr.indexOf(node) === index).filter(visible);
      for (const node of candidates) {{
        const inputNode = node.matches?.('.input-d24X73[contenteditable="true"], .textarea-NCe55j, textarea, [contenteditable="true"]') ? node : node.querySelector('.input-d24X73[contenteditable="true"], .textarea-NCe55j, textarea, [contenteditable="true"]');
        if (!inputNode || !visible(inputNode)) continue;
        const placeholder = inputNode.getAttribute('placeholder') || inputNode.getAttribute('aria-placeholder') || '';
        const footer = node.querySelector('.footer-oZJTJd') || node.closest('.wrap-NeUN4f')?.querySelector('.footer-oZJTJd') || node;
        const sendNode = Array.from(footer.querySelectorAll('button, [role="button"], span, div')).find((el) => visible(el) && textOf(el) === '发送') || null;
        const cancelNode = Array.from(footer.querySelectorAll('button, [role="button"], span, div')).find((el) => visible(el) && textOf(el) === '取消') || null;
        const isReplyScoped = placeholder.startsWith('回复') || !!cancelNode || !!sendNode || !!node.closest('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6');
        if (isReplyScoped) {{
          const editorNode = (node === inputNode)
            ? (inputNode.closest('.reply-content-obcMk0, .reply-NYBpwz, .wrap-NeUN4f, .container-caZWO6') || inputNode.parentElement || inputNode)
            : node;
          const editorFooter = editorNode.querySelector?.('.footer-oZJTJd') || editorNode.closest?.('.wrap-NeUN4f')?.querySelector?.('.footer-oZJTJd') || editorNode;
          const editorSendNode = Array.from(editorFooter.querySelectorAll?.('button, [role="button"], span, div') || []).find((el) => visible(el) && textOf(el) === '发送') || sendNode || null;
          const editorCancelNode = Array.from(editorFooter.querySelectorAll?.('button, [role="button"], span, div') || []).find((el) => visible(el) && textOf(el) === '取消') || cancelNode || null;
          return {{node: editorNode, inputNode, sendNode: editorSendNode, cancelNode: editorCancelNode, placeholder}};
        }}
      }}
      return null;
    }};

    const cards = Array.from(document.querySelectorAll('.container-sXKyMs')).filter((card) => visible(card) && !card.closest('.reply-list-QwXCb_'));
    const mapped = cards.map((card) => {{
      const authorNode = card.querySelector('.username-aLgaNB');
      const timeNode = card.querySelector('.time-NRtTXO');
      const authorName = ownText(authorNode, ['.tag-DAEcKE']);
      const timeText = textOf(timeNode);
      const contentText = extractCommentContent(card, authorName, timeText).slice(0, 200);
      const threadHost = card.parentElement || card;
      const editor = findLocalReplyEditor(threadHost);
      return {{card, threadHost, author: authorName, timeText, content: contentText, threadKey: [authorName, timeText, contentText.slice(0, 80)].join(' | '), editor}};
    }});
    let resolvedBy = 'thread_exact';
    let target = mapped.find((item) => payload.threadKey && item.threadKey === payload.threadKey && item.editor) || null;
    if (!target) {{ target = mapped.find((item) => item.author === payload.author && payload.content && item.content === payload.content && item.editor) || null; resolvedBy = target ? 'author_content' : resolvedBy; }}
    if (!target) {{ target = mapped.find((item) => item.author === payload.author && item.editor) || null; resolvedBy = target ? 'author_only' : resolvedBy; }}
    if (!target) {{ const generic = mapped.filter((item) => item.editor); target = generic[0] || null; resolvedBy = target ? 'visible_editor_fallback' : resolvedBy; }}
    if (!target || !target.editor || !target.editor.inputNode) {{
      return JSON.stringify({{ok: false, action: 'comment_dry_run_send_click_plan', state: 'editor_missing', clicked: false, payload, mappedCount: mapped.length, replyEditorsFound: mapped.filter((item) => item.editor).length, decision: 'log_only_no_send'}});
    }}
    const draftReadback = textOf(target.editor.inputNode);
    const expected = String(payload.expectedText || '').replace(/\s+/g, ' ').trim();
    const sendNode = target.editor.sendNode || null;
    const afterDisabled = sendNode ? disabledOf(sendNode) : null;
    const rect = rectOf(sendNode);
    const center = centerOf(sendNode);
    return JSON.stringify({{
      ok: true,
      action: 'comment_dry_run_send_click_plan',
      state: sendNode ? 'send_button_located' : 'send_button_missing',
      clicked: false,
      dispatchEvents: false,
      focusChanged: false,
      payload,
      resolvedBy,
      threadKey: target.threadKey,
      author: target.author,
      editorVisible: true,
      draftPreview: draftReadback.slice(0, 120),
      readbackMatched: !!expected && draftReadback === expected,
      sendFound: !!sendNode,
      afterDisabled,
      sendFound: !!editor.sendNode,
      sendEnabled: afterDisabled === false,
      sendButtonRect: rectOf(editor.sendNode),
      sendButtonCenter: centerOf(editor.sendNode),
      sendButtonHint: pathHint(editor.sendNode),
      sendEnabled: afterDisabled === false,
      sendButtonRect: rect,
      sendButtonCenter: center,
      sendButtonHint: pathHint(sendNode),
      editorRect: rectOf(target.editor.node),
      editorHint: pathHint(target.editor.node),
      decision: 'mock_click_plan_only_no_send',
      safety: 'no_mouse_or_pointer_events_dispatched'
    }});
  }} catch (err) {{
    return JSON.stringify({{ok: false, action: 'comment_dry_run_send_click_plan', state: 'error', clicked: false, error: String(err), decision: 'log_only_no_send'}});
  }}
}})();
"""
