import { request } from '@/api/core/http';
import { isRecord, normalizePageResult, pickString, unwrapData, type PageResult } from '@/utils/apiData';
import type { CustomerServiceConversationStateSummary } from '@/modules/customer-service/types/simulation.types';

export interface DialogueConversationQuery {
  tenantId?: string;
  robotId?: string;
  platform?: string;
  nickname?: string;
  keyword?: string;
  identityStatus?: string;
  conversationIds?: string;
  page?: number;
  pageSize?: number;
}

export interface DialogueConversationItem {
  id: string;
  tenantId: string;
  robotId: string;
  platform: string;
  displayName: string;
  contactGroupId: string;
  canonicalConversationIds: string[];
  conversationCount: number;
  chatScope: string;
  mergeReason: string;
  identityStatus: string;
  identityConfidence: number;
  lastMatchReason: string;
  workflowConversationId: string;
  messageCount: number;
  rawMessageCount: number;
  deduplicatedMessageCount: number;
  firstMessageAt?: string;
  lastMessageAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DialogueMessageItem {
  id: string;
  conversationId: string;
  localConversationId: string;
  sourceClientId: string;
  clientMessageId: string;
  senderRole: string;
  actorSource: string;
  attributionConfidence: string;
  messageType: string;
  textContent: string;
  typePlaceholder: string;
  sequenceIndex: number;
  historyKind: string;
  timeAccuracy: string;
  observedAt?: string;
  replyAttemptId: string;
  replyTraceId: string;
  generationSource: string;
  payloadFingerprint: string;
  evidenceLevel: string;
  feedbackMode: string;
  feedbackReason: string;
  sourceLabel: string;
  mediaLabel: string;
  isMediaMessage: boolean;
}

export type CanonicalStateTargetType = 'CANONICAL_FIELD' | 'MEMORY';

export interface CanonicalConversationStateValue {
  value: unknown;
  status: 'EXPLICIT' | 'INFERRED' | 'UNKNOWN' | 'CONFLICTED' | 'STALE';
  confidence: number;
  evidenceMessageIds: string[];
  reason: string;
  updatedAt: string | null;
}

export interface CanonicalConversationStateDetail {
  enabled: boolean;
  conversationId: string;
  robotId?: string;
  revision?: number;
  stateHash?: string;
  rebuildRequired?: boolean;
  lastRebuiltAt?: string | null;
  lastRebuildReason?: string | null;
  sourceConversationIds?: string[];
  state: CustomerServiceConversationStateSummary | null;
  evidenceMessages: Array<{
    id: string;
    conversationId: string;
    clientMessageId: string;
    senderRole: string;
    textContent: string;
    observedAt: string;
  }>;
}

export interface CanonicalConversationStateMutationResult {
  status: 'INVALIDATED' | 'UNCHANGED' | 'CONFLICT' | 'NOT_CANONICAL' | 'REBUILT';
  revision?: number;
  stateHash?: string;
  rebuildRequired?: boolean;
}

export async function listDialogueConversations(query: DialogueConversationQuery): Promise<PageResult<DialogueConversationItem>> {
  const payload = await request<unknown>({ path: '/dialogue-records/conversations', query });
  const page = normalizePageResult<unknown>(payload);
  return { ...page, items: page.items.map(normalizeConversation) };
}

export async function listDialogueMessages(id: string, query: { page?: number; pageSize?: number; keyword?: string } = {}) {
  const payload = await request<unknown>({ path: `/dialogue-records/conversations/${id}/messages`, query });
  const page = normalizePageResult<unknown>(payload);
  const value = unwrapData(payload);
  const row = isRecord(value) ? value : {};
  return {
    ...page,
    items: page.items.map(normalizeMessage),
    rawTotal: Number(row.rawTotal || page.total),
    deduplicatedCount: Number(row.deduplicatedCount || 0),
    contactGroupId: pickString(row, ['contactGroupId']),
    canonicalConversationIds: Array.isArray(row.canonicalConversationIds)
      ? row.canonicalConversationIds.map((item) => String(item || '')).filter(Boolean)
      : [],
    conversationCount: Number(row.conversationCount || 1)
  };
}

export async function getCanonicalConversationState(id: string): Promise<CanonicalConversationStateDetail> {
  return unwrapData(await request<unknown>({
    path: `/dialogue-records/conversations/${encodeURIComponent(id)}/canonical-state`,
    method: 'GET',
    skipGlobalLoading: true,
    skipGlobalError: true
  }));
}

export async function invalidateCanonicalConversationState(
  id: string,
  payload: { targetType: CanonicalStateTargetType; targetKey: string; reason?: string }
): Promise<CanonicalConversationStateMutationResult> {
  return unwrapData(await request<unknown>({
    path: `/dialogue-records/conversations/${encodeURIComponent(id)}/canonical-state/invalidate`,
    method: 'POST',
    body: payload,
    skipGlobalLoading: true
  }));
}

export async function rebuildCanonicalConversationState(id: string): Promise<CanonicalConversationStateMutationResult> {
  return unwrapData(await request<unknown>({
    path: `/dialogue-records/conversations/${encodeURIComponent(id)}/canonical-state/rebuild`,
    method: 'POST',
    skipGlobalLoading: true
  }));
}

export interface DialogueExportResult {
  filename: string;
  mimeType: string;
  content: string;
  conversationCount: number;
  canonicalConversationCount: number;
  messageCount: number;
}

export async function exportDialogueRecords(
  query: DialogueConversationQuery & { format?: 'csv' | 'json' }
): Promise<DialogueExportResult> {
  const payload = await request<unknown>({
    path: '/dialogue-records/export',
    query
  });
  const value = unwrapData(payload);
  const row = isRecord(value) ? value : {};
  const filename = pickString(row, ['filename']);
  const mimeType = pickString(row, ['mimeType']) || 'application/octet-stream';
  const content = typeof row.content === 'string' ? row.content : '';
  if (!filename || typeof row.content !== 'string') {
    throw new Error('导出接口返回格式异常，请刷新页面后重试');
  }
  return {
    filename,
    mimeType,
    content,
    conversationCount: Number(row.conversationCount || 0),
    canonicalConversationCount: Number(row.canonicalConversationCount || 0),
    messageCount: Number(row.messageCount || 0)
  };
}

export async function deleteDialogueConversations(conversationIds: string[], hardDelete = true) {
  return request<{ deletedCount: number; contactCount: number; watermarkCount: number; mode: string }>({
    path: '/dialogue-records/delete',
    method: 'POST',
    body: { conversationIds, hardDelete }
  });
}

export async function purgeDialogueRecords(payload: {
  confirm: 'DELETE';
  tenantId?: string;
  robotId?: string;
  platform?: string;
  nickname?: string;
  keyword?: string;
  identityStatus?: string;
}) {
  return request<{ deletedCount: number; contactCount: number; watermarkCount: number; mode: string }>({
    path: '/dialogue-records/purge',
    method: 'POST',
    body: payload
  });
}

function normalizeConversation(payload: unknown): DialogueConversationItem {
  const value = unwrapData(payload);
  const row = isRecord(value) ? value : {};
  return {
    id: pickString(row, ['id']),
    tenantId: pickString(row, ['tenantId']),
    robotId: pickString(row, ['robotId']),
    platform: pickString(row, ['platform']),
    displayName: pickString(row, ['displayName']),
    contactGroupId: pickString(row, ['contactGroupId']),
    canonicalConversationIds: Array.isArray(row.canonicalConversationIds)
      ? row.canonicalConversationIds.map((item) => String(item || '')).filter(Boolean)
      : [],
    conversationCount: Number(row.conversationCount || 1),
    chatScope: pickString(row, ['chatScope']),
    mergeReason: pickString(row, ['mergeReason']),
    identityStatus: pickString(row, ['identityStatus']),
    identityConfidence: Number(row.identityConfidence || 0),
    lastMatchReason: pickString(row, ['lastMatchReason']),
    workflowConversationId: pickString(row, ['workflowConversationId']),
    messageCount: Number(row.messageCount || 0),
    rawMessageCount: Number(row.rawMessageCount || row.messageCount || 0),
    deduplicatedMessageCount: Number(row.deduplicatedMessageCount || 0),
    firstMessageAt: pickString(row, ['firstMessageAt']),
    lastMessageAt: pickString(row, ['lastMessageAt']),
    createdAt: pickString(row, ['createdAt']),
    updatedAt: pickString(row, ['updatedAt'])
  };
}

function normalizeMessage(payload: unknown): DialogueMessageItem {
  const value = unwrapData(payload);
  const row = isRecord(value) ? value : {};
  return {
    id: pickString(row, ['id']),
    conversationId: pickString(row, ['conversationId']),
    localConversationId: pickString(row, ['localConversationId']),
    sourceClientId: pickString(row, ['sourceClientId']),
    clientMessageId: pickString(row, ['clientMessageId']),
    senderRole: pickString(row, ['senderRole']),
    actorSource: pickString(row, ['actorSource']),
    attributionConfidence: pickString(row, ['attributionConfidence']),
    messageType: pickString(row, ['messageType']),
    textContent: pickString(row, ['textContent']),
    typePlaceholder: pickString(row, ['typePlaceholder']),
    sequenceIndex: Number(row.sequenceIndex || 0),
    historyKind: pickString(row, ['historyKind']),
    timeAccuracy: pickString(row, ['timeAccuracy']),
    observedAt: pickString(row, ['observedAt']),
    replyAttemptId: pickString(row, ['replyAttemptId']),
    replyTraceId: pickString(row, ['replyTraceId']),
    generationSource: pickString(row, ['generationSource']),
    payloadFingerprint: pickString(row, ['payloadFingerprint']),
    evidenceLevel: pickString(row, ['evidenceLevel']),
    feedbackMode: pickString(row, ['feedbackMode']),
    feedbackReason: pickString(row, ['feedbackReason']),
    sourceLabel: pickString(row, ['sourceLabel']),
    mediaLabel: pickString(row, ['mediaLabel']),
    isMediaMessage: Boolean(row.isMediaMessage)
  };
}
