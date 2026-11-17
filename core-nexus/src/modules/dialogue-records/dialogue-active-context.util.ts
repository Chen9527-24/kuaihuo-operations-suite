export type DialogueActiveContextSelectionMode = 'FULL_HISTORY' | 'STATE_EVIDENCE_RECENT';

export type DialogueActiveContextSelection<T> = {
  selectedRows: T[];
  selectionMode: DialogueActiveContextSelectionMode;
  evidenceRecallCount: number;
  estimatedHistoryTokens: number;
  allHistoryIncluded: boolean;
};

export const DIALOGUE_ACTIVE_CONTEXT_DEFAULT_TOKEN_BUDGET = 3_200;
export const DIALOGUE_ACTIVE_CONTEXT_MIN_TOKEN_BUDGET = 800;
export const DIALOGUE_ACTIVE_CONTEXT_MAX_TOKEN_BUDGET = 12_000;
export const DIALOGUE_ACTIVE_CONTEXT_RECENT_TOKEN_RATIO = 0.72;

const ACTIVE_CONTEXT_SOURCE_IDS_KEY = 'activeContextSourceMessageIds';

const DEFAULT_RECENT_TOKEN_RATIO = DIALOGUE_ACTIVE_CONTEXT_RECENT_TOKEN_RATIO;
const MAX_EVIDENCE_IDS = 500;

export function uniqueDialogueRowsById<T extends Record<string, any>>(rows: T[]): T[] {
  const byId = new Map<string, T>();
  const withoutId: T[] = [];
  for (const row of rows || []) {
    const id = String(row?.id || '').trim();
    if (!id) {
      withoutId.push(row);
      continue;
    }
    byId.set(id, row);
  }
  return [...byId.values(), ...withoutId];
}


// Active Context consumes logical conversation turns, not presentation bubble rows.
// Storage/UI may keep each delivered segment for audit/cancellation, but consecutive
// assistant presentation rows are folded before token budgeting and model context.
export function coalesceDialogueActiveContextRows<T extends Record<string, any>>(rows: T[]): T[] {
  const result: T[] = [];
  for (const original of rows || []) {
    const row = { ...original } as T;
    const senderRole = String(row?.senderRole ?? row?.role ?? '').trim().toLowerCase();
    const isAssistant = senderRole === 'account' || senderRole === 'assistant';
    const text = String(row?.textContent ?? row?.content ?? '').trim();
    if (!text) continue;
    const rowSourceIds = dialogueActiveContextRowSourceIds(row);
    const previous = result[result.length - 1];
    const previousRole = String(previous?.senderRole ?? previous?.role ?? '').trim().toLowerCase();
    const previousIsAssistant = previousRole === 'account' || previousRole === 'assistant';
    if (previous && isAssistant && previousIsAssistant) {
      const previousText = String(previous?.textContent ?? previous?.content ?? '').trim();
      const mergedText = [previousText, text].filter(Boolean).join('\n\n');
      const merged = {
        ...previous,
        ...(Object.prototype.hasOwnProperty.call(previous, 'textContent') ? { textContent: mergedText } : {}),
        ...(Object.prototype.hasOwnProperty.call(previous, 'content') ? { content: mergedText } : {}),
        [ACTIVE_CONTEXT_SOURCE_IDS_KEY]: Array.from(new Set([
          ...dialogueActiveContextRowSourceIds(previous),
          ...rowSourceIds,
        ])),
      } as T;
      result[result.length - 1] = merged;
      continue;
    }
    (row as Record<string, any>)[ACTIVE_CONTEXT_SOURCE_IDS_KEY] = rowSourceIds;
    result.push(row);
  }
  return result;
}

function dialogueActiveContextRowSourceIds(row: Record<string, any>): string[] {
  const direct = String(row?.id || '').trim();
  const projected = Array.isArray(row?.[ACTIVE_CONTEXT_SOURCE_IDS_KEY])
    ? row[ACTIVE_CONTEXT_SOURCE_IDS_KEY].map((item: unknown) => String(item || '').trim()).filter(Boolean)
    : [];
  return Array.from(new Set([direct, ...projected].filter(Boolean)));
}

function dialogueActiveContextRowMatchesEvidence(row: Record<string, any>, evidenceIds: Set<string>): boolean {
  return dialogueActiveContextRowSourceIds(row).some((id) => evidenceIds.has(id));
}

export function extractConversationStateEvidenceMessageIds(state: unknown): string[] {
  const result: string[] = [];
  const seenIds = new Set<string>();
  const seenObjects = new Set<object>();

  const visit = (value: unknown, depth: number) => {
    if (result.length >= MAX_EVIDENCE_IDS || depth > 12 || value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    if (seenObjects.has(value as object)) return;
    seenObjects.add(value as object);
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'evidenceMessageIds' && Array.isArray(nested)) {
        for (const item of nested) {
          const id = String(item || '').trim();
          if (!id || seenIds.has(id)) continue;
          seenIds.add(id);
          result.push(id);
          if (result.length >= MAX_EVIDENCE_IDS) return;
        }
        continue;
      }
      visit(nested, depth + 1);
      if (result.length >= MAX_EVIDENCE_IDS) return;
    }
  };

  visit(state, 0);
  return result;
}

export function estimateDialogueContextTextTokens(value: unknown): number {
  const text = String(value || '').trim();
  if (!text) return 0;
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const nonCjk = Math.max(0, text.length - cjk);
  // Conservative tokenizer-independent estimate: CJK is close to one token per
  // character in many chat tokenizers, while latin text is closer to 3-4 chars.
  return Math.max(1, Math.ceil(cjk * 1.05 + nonCjk / 3.2));
}

export function estimateDialogueContextMessageTokens(row: Record<string, any>): number {
  return 6 + estimateDialogueContextTextTokens(row?.textContent ?? row?.content ?? '');
}

export function estimateDialogueContextJsonTokens(value: unknown): number {
  if (value == null) return 0;
  try {
    return estimateDialogueContextTextTokens(JSON.stringify(value));
  } catch {
    return 0;
  }
}

export function selectDialogueActiveContextRows<T extends Record<string, any>>(input: {
  effectiveRows: T[];
  evidenceIds: string[];
  historyTokenBudget: number;
  candidateComplete: boolean;
  recentTokenRatio?: number;
}): DialogueActiveContextSelection<T> {
  const effectiveRows = input.effectiveRows || [];
  const budget = Math.max(0, Math.trunc(Number(input.historyTokenBudget) || 0));
  const allTokens = effectiveRows.reduce((sum, row) => sum + estimateDialogueContextMessageTokens(row), 0);
  if (input.candidateComplete && allTokens <= budget) {
    return {
      selectedRows: effectiveRows,
      selectionMode: 'FULL_HISTORY',
      evidenceRecallCount: 0,
      estimatedHistoryTokens: allTokens,
      allHistoryIncluded: true,
    };
  }

  const ratio = Math.max(0.5, Math.min(0.9, Number(input.recentTokenRatio) || DEFAULT_RECENT_TOKEN_RATIO));
  const recentBudget = Math.max(0, Math.floor(budget * ratio));
  const recent: T[] = [];
  let recentTokens = 0;
  for (let index = effectiveRows.length - 1; index >= 0; index -= 1) {
    const row = effectiveRows[index];
    const cost = estimateDialogueContextMessageTokens(row);
    if (!recent.length && cost <= budget) {
      recent.unshift(row);
      recentTokens += cost;
      continue;
    }
    if (recentTokens + cost > recentBudget) break;
    recent.unshift(row);
    recentTokens += cost;
  }

  const evidenceIdSet = new Set((input.evidenceIds || []).map((item) => String(item || '').trim()).filter(Boolean));
  const selectedIds = new Set(recent.map((item) => String(item?.id || '')).filter(Boolean));
  const evidenceCandidates = effectiveRows
    .filter((item) => dialogueActiveContextRowMatchesEvidence(item, evidenceIdSet) && !selectedIds.has(String(item?.id || '')))
    .reverse();
  const recalled: T[] = [];
  let usedTokens = recentTokens;
  for (const row of evidenceCandidates) {
    const cost = estimateDialogueContextMessageTokens(row);
    if (usedTokens + cost > budget) continue;
    recalled.push(row);
    usedTokens += cost;
  }

  const selectedIdSet = new Set([...selectedIds, ...recalled.map((item) => String(item?.id || '')).filter(Boolean)]);
  const selectedRows = effectiveRows.filter((item) => selectedIdSet.has(String(item?.id || '')));
  return {
    selectedRows,
    selectionMode: 'STATE_EVIDENCE_RECENT',
    evidenceRecallCount: recalled.length,
    estimatedHistoryTokens: selectedRows.reduce((sum, row) => sum + estimateDialogueContextMessageTokens(row), 0),
    allHistoryIncluded: false,
  };
}
