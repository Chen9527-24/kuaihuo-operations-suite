from __future__ import annotations

from typing import Any


def build_comment_log_payloads(result: dict[str, Any]) -> dict[str, Any]:
    counts = result.get('counts', {}) or {}
    current_work = result.get('currentWork', {}) or {}
    work_drawer = result.get('workDrawer', {}) or {}
    summary = {
        'currentWorkTitle': current_work.get('title', ''),
        'selectWorkButtonFound': (result.get('selectWorkButton', {}) or {}).get('found', False),
        'commentFilterText': (result.get('commentFilter', {}) or {}).get('selectedText', ''),
        'workDrawerOpen': work_drawer.get('found', False),
        'workItems': counts.get('workItems', len(work_drawer.get('items', []) or [])),
        'threadCards': counts.get('threadCards', len(result.get('threadCards', []) or [])),
        'unresolvedThreads': counts.get('unresolvedThreads', 0),
        'inlineEditors': counts.get('inlineEditors', len(result.get('inlineEditors', []) or [])),
        'topComposerFound': (result.get('topComposer', {}) or {}).get('found', False),
    }
    work_summary = {
        'currentWork': current_work,
        'selectWorkButton': result.get('selectWorkButton', {}),
        'commentFilter': result.get('commentFilter', {}),
        'sortControl': result.get('sortControl', {}),
        'workDrawer': {
            'found': work_drawer.get('found', False),
            'title': work_drawer.get('title', ''),
            'meta': work_drawer.get('meta', ''),
            'footerText': work_drawer.get('footerText', ''),
            'items': (work_drawer.get('items', []) or [])[:6],
        },
    }
    thread_samples = (result.get('threadCards', []) or [])[:6]
    editor_summary = {
        'topComposer': result.get('topComposer', {}),
        'inlineEditors': (result.get('inlineEditors', []) or [])[:4],
        'actionButtons': (result.get('actionButtons', []) or [])[:8],
    }
    return {
        'summary': summary,
        'workSummary': work_summary,
        'threadSamples': thread_samples,
        'editorSummary': editor_summary,
    }
