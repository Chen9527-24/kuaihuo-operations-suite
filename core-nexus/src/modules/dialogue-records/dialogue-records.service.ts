import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { getPagination } from '../../common/dto/pagination.dto';
import type { CurrentUserPayload } from '../../common/types/current-user.type';
import { resolveRequiredTenantId, resolveTenantId } from '../../common/utils/tenant-scope';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CustomerServiceCanonicalConversationStateService,
  type CustomerServiceCanonicalLifecycleResult,
} from '../customer-service-agent/runtime/state/customer-service-canonical-conversation-state.service';
import {
  toCanonicalDialogueEvent,
  type CustomerServiceCanonicalDialogueEvent,
} from '../customer-service-agent/infrastructure/persistence/customer-service-canonical-conversation-state.repository';
import {
  projectCustomerServiceActiveContextBudgetState,
  summarizeCustomerServiceConversationState,
} from '../customer-service-agent/runtime/state/customer-service-conversation-state.reducer';
import {
  DIALOGUE_ACTIVE_CONTEXT_DEFAULT_TOKEN_BUDGET,
  DIALOGUE_ACTIVE_CONTEXT_MAX_TOKEN_BUDGET,
  DIALOGUE_ACTIVE_CONTEXT_MIN_TOKEN_BUDGET,
  DIALOGUE_ACTIVE_CONTEXT_RECENT_TOKEN_RATIO,
  estimateDialogueContextJsonTokens,
  estimateDialogueContextTextTokens,
  coalesceDialogueActiveContextRows,
  extractConversationStateEvidenceMessageIds,
  selectDialogueActiveContextRows,
  uniqueDialogueRowsById,
} from './dialogue-active-context.util';
import {
  DeleteDialogueConversationsDto,
  DialogueConversationQueryDto,
  DialogueExportQueryDto,
  DialogueMessageQueryDto,
  DialogueMessageSyncDto,
  InvalidateCanonicalConversationStateDto,
  CANONICAL_STATE_FIELD_KEYS,
  DialogueWindowMessageDto,
  PurgeDialogueRecordsDto,
  ResolveSyncDialogueDto,
} from './dto/dialogue-records.dto';

interface NormalizedWindowMessage {
  senderRole: string;
  messageType: string;
  content: string;
  actorSource: string;
  attributionConfidence: string;
  signature: string;
}

interface CandidateScore {
  id: string;
  score: number;
  overlap: number;
  confirmedReplyMatches: number;
  reason: string;
}

export type DialogueActiveContextWindow = {
  budgetApplied: true;
  selectionMode: 'FULL_HISTORY' | 'STATE_EVIDENCE_RECENT';
  tokenBudget: number;
  estimatedTokens: number;
  estimatedCurrentMessageTokens: number;
  estimatedStateTokens: number;
  estimatedHistoryTokens: number;
  historyTokenBudget: number;
  allHistoryIncluded: boolean;
  selectedMessageCount: number;
  candidateMessageCount: number;
  physicalMessageCount?: number;
  estimatedInternalStateTokens?: number;
  stateProjection?: 'GENERATION_RELEVANT_BUDGET_V1';
  evidenceRecallCount: number;
  sourceConversationIds: string[];
  sourceConversationCount: number;
};

type CanonicalLifecycleSnapshot = {
  events: CustomerServiceCanonicalDialogueEvent[];
  changedEventIds: string[];
  complete: boolean;
};

const C5B_LIFECYCLE_RECENT_EVENT_LIMIT = 240;
const C5B_LIFECYCLE_FULL_EVENT_LIMIT = 50_000;
const C5B_ACTIVE_CONTEXT_CANDIDATE_LIMIT = 400;

@Injectable()
export class DialogueRecordsService {
  private readonly logger = new Logger(DialogueRecordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly canonicalState: CustomerServiceCanonicalConversationStateService,
  ) {}

  async resolveAndSync(dto: ResolveSyncDialogueDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    await this.assertRobotScope(dto.robotId, tenantId);
    const normalizedName = this.normalizeName(dto.userNickname);
    const platform = this.clean(dto.platform, 32).toUpperCase();
    const channelType = this.clean(dto.channelType || 'dm', 16);
    const requestedChatType = this.normalizeChatType(dto.chatType);
    const sourceClientId = this.clean(dto.sourceClientId, 128);
    const localConversationId = this.clean(dto.localConversationId, 128);
    const identityKey = this.clean(dto.identityKey, 128);
    const identitySource = this.clean(dto.identitySource, 64).toLowerCase();
    const suppliedIdentityConfidence = Math.max(0, Math.min(100, Number(dto.identityConfidence || 0)));
    const strongPlatformIdentity = Boolean(
      identityKey
      && identitySource === 'platform_session_id'
      && suppliedIdentityConfidence >= 90,
    );
    const currentWindow = (dto.currentWindow ?? []).map((item) => this.normalizeWindowMessage(item)).filter(Boolean) as NormalizedWindowMessage[];
    const messageSourceClientIds = Array.from(new Set([
      sourceClientId,
      ...(dto.messages ?? []).map((item) => this.clean(item.sourceClientId || sourceClientId, 128)),
    ].filter(Boolean)));
    const watermarks = await db.dialogueSyncWatermark.findMany({
      where: {
        tenantId,
        robotId: dto.robotId,
        localConversationId,
        sourceClientId: { in: messageSourceClientIds },
      },
    });
    const watermarkBySource = new Map<string, Date>(
      watermarks.map((item: any) => [String(item.sourceClientId), new Date(item.deletedBeforeAt)]),
    );
    const syncMessages = (dto.messages ?? []).filter((item) => {
      const itemSourceClientId = this.clean(item.sourceClientId || sourceClientId, 128);
      const deletedBeforeAt = watermarkBySource.get(itemSourceClientId);
      if (!deletedBeforeAt) return true;
      return this.parseDate(item.observedAtUtc).getTime() > deletedBeforeAt.getTime();
    });

    const existingAlias = await db.dialogueConversationAlias.findUnique({
      where: {
        tenantId_robotId_sourceClientId_localConversationId: {
          tenantId,
          robotId: dto.robotId,
          sourceClientId,
          localConversationId,
        },
      },
      include: { conversation: true },
    });

    const aliasConversation = existingAlias?.conversation && !existingAlias.conversation.deletedAt
      ? existingAlias.conversation
      : null;
    const aliasScopeCompatible = aliasConversation
      ? strongPlatformIdentity || this.isChatTypeCompatible(aliasConversation.chatType, requestedChatType)
      : false;
    let conversation = aliasScopeCompatible ? aliasConversation : null;
    let match: CandidateScore | null = null;
    let secondScore = 0;

    if (conversation) {
      if (strongPlatformIdentity) {
        match = {
          id: conversation.id,
          score: 100,
          overlap: currentWindow.length,
          confirmedReplyMatches: 0,
          reason: 'trusted_platform_session_alias',
        };
      } else if (conversation.identityStatus === 'CONFIRMED') {
        match = {
          id: conversation.id,
          score: Math.max(70, Number(conversation.identityConfidence || 0)),
          overlap: currentWindow.length,
          confirmedReplyMatches: 0,
          reason: 'local_alias_exact_confirmed',
        };
      } else {
        const recent = await db.dialogueMessage.findMany({
          where: { conversationId: conversation.id },
          orderBy: [{ observedAt: 'desc' }, { sequenceIndex: 'desc' }],
          take: 20,
        });
        const normalizedRecent = recent.reverse().map((item: any) => this.normalizeWindowMessage(item)).filter(Boolean) as NormalizedWindowMessage[];
        const continuity = this.scoreCandidate(conversation.id, currentWindow, normalizedRecent);
        const hasNewEvidence = await this.hasNewAliasEvidence(
          db,
          conversation.id,
          sourceClientId,
          dto.currentClientMessageIds ?? [],
          currentWindow,
          normalizedRecent,
        );
        const strongContinuity = hasNewEvidence
          && continuity.score >= 70
          && continuity.overlap >= 2
          && (continuity.confirmedReplyMatches > 0 || continuity.overlap >= 3);
        match = strongContinuity
          ? { ...continuity, reason: `local_alias_continuity_${continuity.reason}` }
          : {
              id: conversation.id,
              score: 0,
              overlap: continuity.overlap,
              confirmedReplyMatches: continuity.confirmedReplyMatches,
              reason: 'local_alias_reused_insufficient_new_evidence',
            };
      }
    }

    if (!conversation) {
      const candidateChatTypes = this.candidateChatTypes(requestedChatType);
      const candidates = await db.dialogueConversation.findMany({
        where: {
          tenantId,
          robotId: dto.robotId,
          platform,
          channelType,
          chatType: { in: candidateChatTypes },
          normalizedDisplayName: normalizedName,
          deletedAt: null,
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 20,
      });
      const scores: CandidateScore[] = [];
      for (const candidate of candidates) {
        const recent = await db.dialogueMessage.findMany({
          where: { conversationId: candidate.id },
          orderBy: [{ observedAt: 'desc' }, { sequenceIndex: 'desc' }],
          take: 20,
        });
        const normalizedRecent = recent.reverse().map((item: any) => this.normalizeWindowMessage(item)).filter(Boolean) as NormalizedWindowMessage[];
        scores.push(this.scoreCandidate(candidate.id, currentWindow, normalizedRecent));
      }
      scores.sort((a, b) => b.score - a.score);
      const best = scores[0];
      secondScore = scores[1]?.score ?? 0;
      if (best && best.score >= 70 && best.score - secondScore >= 15) {
        conversation = candidates.find((item: any) => item.id === best.id) ?? null;
        match = best;
      }
    }

    if (!conversation) {
      conversation = await db.dialogueConversation.create({
        data: {
          tenantId,
          robotId: dto.robotId,
          platform,
          channelType,
          chatType: requestedChatType,
          botNickname: this.clean(dto.botNickname, 100),
          displayName: this.clean(dto.userNickname, 100),
          normalizedDisplayName: normalizedName,
          identityStatus: strongPlatformIdentity ? 'CONFIRMED' : 'PROVISIONAL',
          identityConfidence: strongPlatformIdentity ? suppliedIdentityConfidence : 0,
          lastMatchReason: strongPlatformIdentity
            ? 'trusted_platform_session_id'
            : aliasConversation && !aliasScopeCompatible
            ? 'new_conversation_alias_scope_conflict'
            : 'new_conversation_insufficient_evidence',
        },
      });
      match = {
        id: conversation.id,
        score: strongPlatformIdentity ? suppliedIdentityConfidence : 0,
        overlap: 0,
        confirmedReplyMatches: 0,
        reason: strongPlatformIdentity
          ? 'trusted_platform_session_id'
          : aliasConversation && !aliasScopeCompatible
          ? 'alias_scope_conflict'
          : 'new_conversation',
      };
    } else {
      const status = strongPlatformIdentity || (match?.score ?? 0) >= 70 ? 'CONFIRMED' : conversation.identityStatus;
      const nextChatType = strongPlatformIdentity
        ? requestedChatType
        : this.shouldUpgradeLegacyChatType(conversation.chatType, requestedChatType)
        ? requestedChatType
        : conversation.chatType;
      conversation = await db.dialogueConversation.update({
        where: { id: conversation.id },
        data: {
          chatType: nextChatType,
          botNickname: this.clean(dto.botNickname, 100),
          displayName: this.clean(dto.userNickname, 100),
          normalizedDisplayName: normalizedName,
          identityStatus: status,
          identityConfidence: Math.max(
            Number(conversation.identityConfidence || 0),
            match?.score ?? 0,
            strongPlatformIdentity ? suppliedIdentityConfidence : 0,
          ),
          lastMatchReason: match?.reason ?? 'alias_reused',
        },
      });
    }

    const windowHash = this.sha256(currentWindow.map((item) => item.signature).join('|'));
    const previousAliasConfidence = existingAlias?.conversationId === conversation.id
      ? Number(existingAlias?.confidence || 0)
      : 0;
    await db.dialogueConversationAlias.upsert({
      where: {
        tenantId_robotId_sourceClientId_localConversationId: {
          tenantId,
          robotId: dto.robotId,
          sourceClientId,
          localConversationId,
        },
      },
      create: {
        tenantId,
        robotId: dto.robotId,
        conversationId: conversation.id,
        sourceClientId,
        localConversationId,
        aliasHash: this.sha256(`${sourceClientId}|${localConversationId}`),
        confidence: match?.score ?? 0,
        lastWindowHash: windowHash,
      },
      update: {
        conversationId: conversation.id,
        confidence: Math.max(match?.score ?? 0, previousAliasConfidence),
        lastWindowHash: windowHash,
        lastSeenAt: new Date(),
      },
    });

    const suppliedTraceIds = Array.from(new Set(syncMessages.map((item) => this.clean(item.replyTraceId, 512)).filter(Boolean)));
    const suppliedAttemptIds = Array.from(new Set(syncMessages.map((item) => this.clean(item.replyAttemptId, 256)).filter(Boolean)));
    const authoritativeTraces = suppliedTraceIds.length || suppliedAttemptIds.length
      ? await db.customerServiceReplyTrace.findMany({
          where: {
            tenantId,
            robotId: dto.robotId,
            OR: [
              ...(suppliedTraceIds.length ? [{ id: { in: suppliedTraceIds } }] : []),
              ...(suppliedAttemptIds.length ? [{ replyAttemptId: { in: suppliedAttemptIds } }] : []),
            ],
          },
          select: { id: true, replyAttemptId: true, generationSource: true },
        })
      : [];
    type AuthoritativeReplyTrace = { id: string; replyAttemptId: string | null; generationSource: string | null };
    const traceById = new Map<string, AuthoritativeReplyTrace>(
      authoritativeTraces.map((trace: AuthoritativeReplyTrace) => [String(trace.id), trace]),
    );
    const traceByAttempt = new Map<string, AuthoritativeReplyTrace>(
      authoritativeTraces
        .filter((trace: AuthoritativeReplyTrace) => Boolean(trace.replyAttemptId))
        .map((trace: AuthoritativeReplyTrace) => [String(trace.replyAttemptId), trace]),
    );

    let syncedCount = 0;
    const changedIngestKeys: string[] = [];
    const mutatedExistingMessageIds: string[] = [];
    for (const item of syncMessages) {
      const normalized = this.normalizeSyncMessage(item, {
        tenantId,
        robotId: dto.robotId,
        conversationId: conversation.id,
        sourceClientId: item.sourceClientId || sourceClientId,
        localConversationId,
      });
      const trace = normalized.senderRole === 'account'
        ? traceById.get(normalized.replyTraceId) ?? traceByAttempt.get(normalized.replyAttemptId)
        : undefined;
      normalized.replyTraceId = trace?.id ?? '';
      normalized.generationSource = trace?.generationSource ?? '';
      if (trace?.replyAttemptId && !normalized.replyAttemptId) normalized.replyAttemptId = trace.replyAttemptId;
      const before = await db.dialogueMessage.findUnique({
        where: { ingestKey: normalized.ingestKey },
        select: {
          id: true,
          senderRole: true,
          messageType: true,
          textContent: true,
          observedAt: true,
          sequenceIndex: true,
        },
      });
      if (!before) {
        changedIngestKeys.push(normalized.ingestKey);
      } else if (this.lifecycleMessageChanged(before, normalized)) {
        changedIngestKeys.push(normalized.ingestKey);
        mutatedExistingMessageIds.push(String(before.id || '').trim());
      }
      await db.dialogueMessage.upsert({
        where: { ingestKey: normalized.ingestKey },
        create: normalized,
        update: {
          senderRole: normalized.senderRole,
          actorSource: normalized.actorSource,
          attributionConfidence: normalized.attributionConfidence,
          messageType: normalized.messageType,
          textContent: normalized.textContent,
          typePlaceholder: normalized.typePlaceholder,
          sequenceIndex: normalized.sequenceIndex,
          historyKind: normalized.historyKind,
          timeAccuracy: normalized.timeAccuracy,
          observedAt: normalized.observedAt,
          payloadFingerprint: normalized.payloadFingerprint,
          replyAttemptId: normalized.replyAttemptId,
          replyTraceId: normalized.replyTraceId,
          generationSource: normalized.generationSource,
        },
      });
      if (!before) syncedCount += 1;
    }

    const aggregate = await db.dialogueMessage.aggregate({
      where: { conversationId: conversation.id },
      _count: { id: true },
      _min: { observedAt: true },
      _max: { observedAt: true },
    });
    conversation = await db.dialogueConversation.update({
      where: { id: conversation.id },
      data: {
        messageCount: aggregate._count.id,
        firstMessageAt: aggregate._min.observedAt,
        lastMessageAt: aggregate._max.observedAt,
      },
    });

    const relatedConversationIds = strongPlatformIdentity
      ? await this.findStrongIdentityConversationIds(
          tenantId,
          dto.robotId,
          platform,
          channelType,
          localConversationId,
          conversation.id,
        )
      : [conversation.id];
    let canonicalStateLifecycle: CustomerServiceCanonicalLifecycleResult | null = null;
    if (channelType.toLowerCase() === 'dm') {
      try {
        canonicalStateLifecycle = await this.reconcileCanonicalStateAfterSync({
          dialogueConversationId: conversation.id,
          robotId: dto.robotId,
          relatedConversationIds,
          changedIngestKeys,
          mutatedExistingMessageIds,
          user,
        });
      } catch (error) {
        this.logger.warn(
          `Canonical State lifecycle 同步失败但不阻断对话记录：conversation=${conversation.id} error=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const context = conversation.identityStatus === 'CONFIRMED'
      ? await this.getContextRows(
          relatedConversationIds,
          dto.currentClientMessageIds ?? [],
          Math.max(2, Math.min(20, dto.contextLimit ?? 10)),
        )
      : [];

    return {
      canonicalConversationId: conversation.id,
      workflowConversationId: conversation.workflowConversationId || '',
      chatType: conversation.chatType,
      identityStatus: conversation.identityStatus,
      identityConfidence: conversation.identityConfidence,
      matchReason: match?.reason ?? '',
      matchScore: match?.score ?? 0,
      secondScore,
      syncedCount,
      skippedByDeletionWatermark: Math.max(0, (dto.messages ?? []).length - syncMessages.length),
      messageCount: conversation.messageCount,
      contextMessages: context,
      relatedConversationCount: relatedConversationIds.length,
      canonicalStateLifecycle,
    };
  }

  async listConversations(query: DialogueConversationQueryDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const { skip, take, page, pageSize } = getPagination(query);
    const where = this.buildConversationWhere(query, user);
    const matchedRows = await db.dialogueConversation.findMany({
      where,
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: 50000,
    });
    const expandedIds = await this.expandContactConversationIds(matchedRows, user);
    const tenantId = resolveTenantId(user, query.tenantId);
    const rows = expandedIds.length
      ? await db.dialogueConversation.findMany({
          where: {
            id: { in: expandedIds },
            deletedAt: null,
            ...(tenantId ? { tenantId } : {}),
          },
          orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
          take: 50000,
        })
      : [];
    const grouped = this.groupContactConversations(rows);
    const conversationIds = rows.map((item: any) => String(item.id));
    const messages = conversationIds.length
      ? await db.dialogueMessage.findMany({
          where: { conversationId: { in: conversationIds } },
          orderBy: [{ observedAt: 'asc' }, { sequenceIndex: 'asc' }, { createdAt: 'asc' }],
        })
      : [];
    const messagesByConversation = this.groupMessagesByConversation(messages);
    for (const contact of grouped) {
      const contactMessages = (contact.canonicalConversationIds || [])
        .flatMap((conversationId: string) => messagesByConversation.get(conversationId) || []);
      const effective = this.buildEffectiveMessages(contactMessages);
      contact.rawMessageCount = effective.rawCount;
      contact.deduplicatedMessageCount = effective.duplicateCount;
      contact.messageCount = effective.items.length;
      if (effective.items.length) {
        contact.firstMessageAt = effective.items[0].observedAt;
        contact.lastMessageAt = effective.items[effective.items.length - 1].observedAt;
      }
    }
    grouped.sort((left: any, right: any) => {
      const lastDiff = this.dateValue(right.lastMessageAt || right.updatedAt) - this.dateValue(left.lastMessageAt || left.updatedAt);
      if (lastDiff) return lastDiff;
      return this.dateValue(right.updatedAt) - this.dateValue(left.updatedAt);
    });
    return {
      items: grouped.slice(skip, skip + take),
      total: grouped.length,
      page,
      pageSize,
    };
  }

  async listMessages(id: string, query: DialogueMessageQueryDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const representative = await this.findConversationOrThrow(id, user);
    const conversationIds = await this.findContactConversationIds(representative, user);
    const { skip, take, page, pageSize } = getPagination(query);
    const rawItems = await db.dialogueMessage.findMany({
      where: { conversationId: { in: conversationIds } },
      orderBy: [{ observedAt: 'asc' }, { sequenceIndex: 'asc' }, { createdAt: 'asc' }],
    });
    const effective = this.buildEffectiveMessages(rawItems);
    const keyword = this.normalizeDisplayText(query.keyword || '');
    const filtered = keyword
      ? effective.items.filter((item: any) => this.messageDisplayContent(item).includes(keyword))
      : effective.items;
    return {
      items: filtered.slice(skip, skip + take).map((item: any) => this.toDialogueMessageDto(item)),
      total: filtered.length,
      rawTotal: effective.rawCount,
      deduplicatedCount: effective.duplicateCount,
      page,
      pageSize,
      contactGroupId: this.contactGroupId(representative),
      canonicalConversationIds: conversationIds,
      conversationCount: conversationIds.length,
    };
  }

  async getContextForReply(id: string, user: CurrentUserPayload, excludeClientMessageIds: string[] = [], limit = 10) {
    await this.findConversationOrThrow(id, user);
    const items = await this.getContextRows(id, excludeClientMessageIds, Math.max(2, Math.min(20, Number(limit) || 10)));
    return { conversationId: id, items, total: items.length };
  }

  async getActiveContextForReply(
    id: string,
    user: CurrentUserPayload,
    excludeClientMessageIds: string[] = [],
    tokenBudget = DIALOGUE_ACTIVE_CONTEXT_DEFAULT_TOKEN_BUDGET,
    currentMessage = '',
  ) {
    const conversation = await this.findConversationOrThrow(id, user);
    const budget = Math.max(
      DIALOGUE_ACTIVE_CONTEXT_MIN_TOKEN_BUDGET,
      Math.min(
        DIALOGUE_ACTIVE_CONTEXT_MAX_TOKEN_BUDGET,
        Math.trunc(Number(tokenBudget) || DIALOGUE_ACTIVE_CONTEXT_DEFAULT_TOKEN_BUDGET),
      ),
    );
    const state = await this.canonicalState.readRuntimeState({
      dialogueConversationId: id,
      expectedRobotId: String(conversation.robotId || ''),
      user,
    });
    const sourceConversationIds = Array.from(new Set(
      (state?.sourceConversationIds?.length ? state.sourceConversationIds : [id]).map((item) => String(item || '').trim()).filter(Boolean),
    ));
    const db = this.prisma as any;
    const where = this.lifecycleMessageWhere(sourceConversationIds);
    const rawRows = await db.dialogueMessage.findMany({
      where,
      orderBy: [{ observedAt: 'desc' }, { sequenceIndex: 'desc' }, { createdAt: 'desc' }],
      take: C5B_ACTIVE_CONTEXT_CANDIDATE_LIMIT + 1,
    });
    const candidateComplete = rawRows.length <= C5B_ACTIVE_CONTEXT_CANDIDATE_LIMIT;
    const candidateRows = rawRows.slice(0, C5B_ACTIVE_CONTEXT_CANDIDATE_LIMIT);
    const evidenceIds = extractConversationStateEvidenceMessageIds(state?.state);
    const evidenceRows = evidenceIds.length
      ? await db.dialogueMessage.findMany({
          where: { ...where, id: { in: evidenceIds } },
          take: 500,
        })
      : [];
    const excluded = new Set((excludeClientMessageIds || []).map((item) => this.clean(item, 256)).filter(Boolean));
    const mergedRows = uniqueDialogueRowsById([...candidateRows, ...evidenceRows]);
    const physicalEffective = this.buildEffectiveMessages(mergedRows).items
      .filter((item: any) => !excluded.has(this.clean(item?.clientMessageId, 256)));
    const effective = coalesceDialogueActiveContextRows(physicalEffective);
    const stateSummary = state?.state
      ? summarizeCustomerServiceConversationState(state.state, String(currentMessage || '').trim())
      : null;
    const activeContextState = state?.state
      ? projectCustomerServiceActiveContextBudgetState(state.state, String(currentMessage || '').trim())
      : null;
    const estimatedCurrentMessageTokens = estimateDialogueContextTextTokens(currentMessage) + (currentMessage ? 6 : 0);
    const estimatedInternalStateTokens = estimateDialogueContextJsonTokens(stateSummary);
    const estimatedStateTokens = estimateDialogueContextJsonTokens(activeContextState);
    const historyTokenBudget = Math.max(0, budget - estimatedCurrentMessageTokens - estimatedStateTokens);
    const selection = selectDialogueActiveContextRows({
      effectiveRows: effective,
      evidenceIds,
      historyTokenBudget,
      candidateComplete,
      recentTokenRatio: DIALOGUE_ACTIVE_CONTEXT_RECENT_TOKEN_RATIO,
    });
    const selected = selection.selectedRows;
    const selectionMode: DialogueActiveContextWindow['selectionMode'] = selection.selectionMode;
    const evidenceRecallCount = selection.evidenceRecallCount;
    const items = selected.map((item: any) => ({
      clientMessageId: item.clientMessageId,
      senderRole: item.senderRole,
      messageType: item.messageType,
      textContent: item.textContent,
      observedAtUtc: item.observedAt?.toISOString?.() ?? '',
    }));
    const estimatedHistoryTokens = selection.estimatedHistoryTokens;
    const estimatedTokens = estimatedCurrentMessageTokens + estimatedStateTokens + estimatedHistoryTokens;
    const window: DialogueActiveContextWindow = {
      budgetApplied: true,
      selectionMode,
      tokenBudget: budget,
      estimatedTokens,
      estimatedCurrentMessageTokens,
      estimatedStateTokens,
      estimatedHistoryTokens,
      historyTokenBudget,
      allHistoryIncluded: selection.allHistoryIncluded,
      selectedMessageCount: selected.length,
      candidateMessageCount: effective.length + (candidateComplete ? 0 : 1),
      physicalMessageCount: physicalEffective.length + (candidateComplete ? 0 : 1),
      estimatedInternalStateTokens,
      stateProjection: 'GENERATION_RELEVANT_BUDGET_V1',
      evidenceRecallCount,
      sourceConversationIds,
      sourceConversationCount: sourceConversationIds.length,
    };
    return { conversationId: id, items, total: items.length, window };
  }

  async getCanonicalConversationState(id: string, user: CurrentUserPayload) {
    const conversation = await this.findConversationOrThrow(id, user);
    const runtime = await this.canonicalState.readRuntimeState({
      dialogueConversationId: id,
      expectedRobotId: String(conversation.robotId || ''),
      user,
    });
    if (!runtime) {
      return { enabled: false, conversationId: id, state: null, evidenceMessages: [] };
    }
    const evidenceIds = extractConversationStateEvidenceMessageIds(runtime.state);
    const db = this.prisma as any;
    const evidenceMessages = evidenceIds.length
      ? await db.dialogueMessage.findMany({
          where: { id: { in: evidenceIds }, tenantId: conversation.tenantId },
          select: { id: true, conversationId: true, senderRole: true, textContent: true, observedAt: true, clientMessageId: true },
          orderBy: [{ observedAt: 'asc' }, { createdAt: 'asc' }],
          take: 500,
        })
      : [];
    return {
      enabled: true,
      conversationId: id,
      robotId: runtime.robotId,
      revision: runtime.revision,
      stateHash: runtime.stateHash,
      rebuildRequired: runtime.rebuildRequired,
      lastRebuiltAt: runtime.lastRebuiltAt,
      lastRebuildReason: runtime.lastRebuildReason,
      sourceConversationIds: runtime.sourceConversationIds,
      state: summarizeCustomerServiceConversationState(runtime.state, ''),
      evidenceMessages: evidenceMessages.map((item: any) => ({
        id: String(item.id || ''),
        conversationId: String(item.conversationId || ''),
        clientMessageId: String(item.clientMessageId || ''),
        senderRole: String(item.senderRole || ''),
        textContent: String(item.textContent || ''),
        observedAt: item.observedAt?.toISOString?.() || String(item.observedAt || ''),
      })),
    };
  }

  async invalidateCanonicalConversationState(id: string, dto: InvalidateCanonicalConversationStateDto, user: CurrentUserPayload) {
    const conversation = await this.findConversationOrThrow(id, user);
    if (dto.targetType === 'CANONICAL_FIELD' && !CANONICAL_STATE_FIELD_KEYS.includes(dto.targetKey as any)) {
      throw new BadRequestException('不支持的 canonical State 字段；只能失效已定义的业务状态字段');
    }
    return this.canonicalState.invalidateStateTarget({
      dialogueConversationId: id,
      expectedRobotId: String(conversation.robotId || ''),
      targetType: dto.targetType,
      targetKey: dto.targetKey,
      reason: dto.reason,
      user,
    });
  }

  async rebuildCanonicalConversationState(id: string, user: CurrentUserPayload) {
    const conversation = await this.findConversationOrThrow(id, user);
    const runtime = await this.canonicalState.readRuntimeState({
      dialogueConversationId: id,
      expectedRobotId: String(conversation.robotId || ''),
      user,
    });
    if (!runtime) return { status: 'NOT_CANONICAL' };
    const sourceConversationIds = runtime.sourceConversationIds.length ? runtime.sourceConversationIds : [id];
    const snapshot = await this.loadCanonicalLifecycleSnapshot(
      sourceConversationIds,
      [],
      C5B_LIFECYCLE_FULL_EVENT_LIMIT,
      true,
    );
    if (!snapshot.complete) {
      throw new BadRequestException(`当前 canonical 历史超过安全重建上限 ${C5B_LIFECYCLE_FULL_EVENT_LIMIT} 条，请先缩小/归档异常历史后再重建`);
    }
    return this.canonicalState.forceRebuildFromEvents({
      dialogueConversationId: id,
      expectedRobotId: String(conversation.robotId || ''),
      sourceConversationIds,
      events: snapshot.events,
      reason: 'ADMIN_SAFE_REBUILD',
      user,
    });
  }

  async updateWorkflowConversation(id: string, workflowConversationId: string, user: CurrentUserPayload) {
    const db = this.prisma as any;
    await this.findConversationOrThrow(id, user);
    return db.dialogueConversation.update({
      where: { id },
      data: { workflowConversationId: this.clean(workflowConversationId, 256) },
    });
  }

  async exportRecords(query: DialogueExportQueryDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const selectedIds = Array.from(new Set(
      String(query.conversationIds || '')
        .split(',')
        .map((item) => this.clean(item, 128))
        .filter(Boolean),
    )).slice(0, 500);
    if (!selectedIds.length) {
      throw new BadRequestException('请先勾选要导出的联系人记录');
    }

    const selected = await db.dialogueConversation.findMany({
      where: {
        ...this.buildConversationWhere(query, user),
        id: { in: selectedIds },
      },
      take: 500,
    });
    if (!selected.length) {
      throw new BadRequestException('所选联系人记录不存在或已被删除');
    }

    const expandedIds = await this.expandContactConversationIds(selected, user);
    const tenantId = resolveTenantId(user);
    const conversations = await db.dialogueConversation.findMany({
      where: {
        id: { in: expandedIds },
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
      },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: 50000,
      include: { messages: { orderBy: [{ observedAt: 'asc' }, { sequenceIndex: 'asc' }, { createdAt: 'asc' }] } },
    });
    const grouped = this.groupContactConversations(conversations);
    const conversationById = new Map(conversations.map((item: any) => [item.id, item]));
    const contacts = grouped.map((group: any) => {
      const segments = group.canonicalConversationIds
        .map((conversationId: string) => conversationById.get(conversationId))
        .filter(Boolean);
      const rawMessages = segments.flatMap((segment: any) => segment.messages || []);
      const effective = this.buildEffectiveMessages(rawMessages);
      return {
        contactGroupId: group.contactGroupId,
        representativeConversationId: group.id,
        canonicalConversationIds: group.canonicalConversationIds,
        conversationCount: group.conversationCount,
        tenantId: group.tenantId,
        robotId: group.robotId,
        platform: group.platform,
        chatScope: group.chatScope,
        displayName: group.displayName,
        identityStatus: group.identityStatus,
        identityConfidence: group.identityConfidence,
        firstMessageAt: effective.items[0]?.observedAt || group.firstMessageAt,
        lastMessageAt: effective.items[effective.items.length - 1]?.observedAt || group.lastMessageAt,
        rawMessageCount: effective.rawCount,
        deduplicatedMessageCount: effective.duplicateCount,
        messageCount: effective.items.length,
        messages: effective.items,
      };
    });

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const messageCount = contacts.reduce((sum: number, item: any) => sum + item.messages.length, 0);
    if ((query.format || 'csv').toLowerCase() === 'json') {
      return {
        filename: `dialogue-contacts-${date}.json`,
        mimeType: 'application/json;charset=utf-8',
        content: JSON.stringify({ exportedAt: new Date().toISOString(), contacts }, null, 2),
        conversationCount: contacts.length,
        canonicalConversationCount: conversations.length,
        messageCount,
      };
    }

    const headers = [
      'contact_group_id',
      'representative_conversation_id',
      'canonical_conversation_id',
      'conversation_segment_count',
      'robot_id',
      'platform',
      'chat_scope',
      'display_name',
      'identity_status',
      'message_id',
      'sender_role',
      'actor_source',
      'attribution_confidence',
      'message_type',
      'text_content',
      'type_placeholder',
      'observed_at',
      'history_kind',
      'time_accuracy',
      'reply_attempt_id',
    ];
    const rows = [headers.join(',')];
    for (const contact of contacts) {
      for (const message of contact.messages) {
        rows.push([
          contact.contactGroupId,
          contact.representativeConversationId,
          message.conversationId,
          contact.conversationCount,
          contact.robotId,
          contact.platform,
          contact.chatScope,
          contact.displayName,
          contact.identityStatus,
          message.clientMessageId,
          message.senderRole,
          message.actorSource,
          message.attributionConfidence,
          message.messageType,
          message.textContent,
          message.typePlaceholder,
          message.observedAt?.toISOString?.() ?? '',
          message.historyKind,
          message.timeAccuracy,
          message.replyAttemptId,
        ].map((value) => this.csv(value)).join(','));
      }
    }
    return {
      filename: `dialogue-contacts-${date}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      content: `\uFEFF${rows.join('\r\n')}`,
      conversationCount: contacts.length,
      canonicalConversationCount: conversations.length,
      messageCount,
    };
  }

  async deleteConversations(dto: DeleteDialogueConversationsDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const tenantId = resolveTenantId(user);
    const selected = await db.dialogueConversation.findMany({
      where: {
        id: { in: dto.conversationIds },
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
      },
      take: 500,
    });
    const ids = await this.expandContactConversationIds(selected, user);
    if (!ids.length) return { deletedCount: 0, contactCount: 0, watermarkCount: 0 };
    const watermarkCount = await this.createDeletionWatermarks(ids, db, 'USER_DELETE');
    const contactCount = this.groupContactConversations(selected).length;
    if (dto.hardDelete === false) {
      const result = await db.dialogueConversation.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });
      return { deletedCount: result.count, contactCount, watermarkCount, mode: 'soft' };
    }
    const result = await db.dialogueConversation.deleteMany({ where: { id: { in: ids } } });
    return { deletedCount: result.count, contactCount, watermarkCount, mode: 'hard' };
  }

  async purge(dto: PurgeDialogueRecordsDto, user: CurrentUserPayload) {
    if (dto.confirm !== 'DELETE') throw new BadRequestException('confirm must equal DELETE');
    const db = this.prisma as any;
    const where = this.buildConversationWhere({
      tenantId: dto.tenantId,
      robotId: dto.robotId,
      platform: dto.platform,
      nickname: dto.nickname,
      keyword: dto.keyword,
      identityStatus: dto.identityStatus,
      page: 1,
      pageSize: 1,
    }, user);
    const selected = await db.dialogueConversation.findMany({ where, take: 50000 });
    const ids = await this.expandContactConversationIds(selected, user);
    const contactCount = this.groupContactConversations(selected).length;
    if (!ids.length) return { deletedCount: 0, contactCount: 0, watermarkCount: 0, mode: 'hard' };
    const watermarkCount = await this.createDeletionWatermarks(ids, db, 'FILTER_PURGE');
    const result = await db.dialogueConversation.deleteMany({ where: { id: { in: ids } } });
    return { deletedCount: result.count, contactCount, watermarkCount, mode: 'hard' };
  }

  private contactChatScope(chatType: unknown) {
    return this.normalizeChatType(chatType) === 'group' ? 'group' : 'private';
  }

  private contactGroupKey(conversation: any) {
    const normalizedName = this.normalizeName(
      conversation?.normalizedDisplayName || conversation?.displayName,
    );
    if (!normalizedName) return `conversation:${conversation?.id || ''}`;
    return [
      this.clean(conversation?.tenantId, 128),
      this.clean(conversation?.robotId, 128),
      this.clean(conversation?.platform, 32).toUpperCase(),
      this.contactChatScope(conversation?.chatType),
      normalizedName,
    ].join('|');
  }

  private contactGroupId(conversation: any) {
    return `contact_${this.sha256(this.contactGroupKey(conversation)).slice(0, 24)}`;
  }

  private groupContactConversations(rows: any[]): any[] {
    const groups = new Map<string, any[]>();
    for (const row of rows || []) {
      const key = this.contactGroupKey(row);
      const values = groups.get(key) || [];
      values.push(row);
      groups.set(key, values);
    }

    const result: any[] = [];
    for (const values of groups.values()) {
      values.sort((left: any, right: any) => {
        const lastDiff = this.dateValue(right.lastMessageAt || right.updatedAt) - this.dateValue(left.lastMessageAt || left.updatedAt);
        if (lastDiff) return lastDiff;
        return this.dateValue(right.updatedAt) - this.dateValue(left.updatedAt);
      });
      const representative = values[0];
      const firstMessageValues = values.map((item: any) => this.dateValue(item.firstMessageAt)).filter((value: number) => value > 0);
      const lastMessageValues = values.map((item: any) => this.dateValue(item.lastMessageAt)).filter((value: number) => value > 0);
      const createdValues = values.map((item: any) => this.dateValue(item.createdAt)).filter((value: number) => value > 0);
      const updatedValues = values.map((item: any) => this.dateValue(item.updatedAt)).filter((value: number) => value > 0);
      const identityConfidence = Math.max(...values.map((item: any) => Number(item.identityConfidence || 0)), 0);
      const identityStatus = values.some((item: any) => item.identityStatus === 'CONFIRMED')
        ? 'CONFIRMED'
        : 'PROVISIONAL';
      result.push({
        ...representative,
        id: representative.id,
        contactGroupId: this.contactGroupId(representative),
        canonicalConversationIds: values.map((item: any) => item.id),
        conversationCount: values.length,
        chatScope: this.contactChatScope(representative.chatType),
        identityStatus,
        identityConfidence,
        messageCount: values.reduce((sum: number, item: any) => sum + Number(item.messageCount || 0), 0),
        firstMessageAt: firstMessageValues.length ? new Date(Math.min(...firstMessageValues)) : null,
        lastMessageAt: lastMessageValues.length ? new Date(Math.max(...lastMessageValues)) : null,
        createdAt: createdValues.length ? new Date(Math.min(...createdValues)) : representative.createdAt,
        updatedAt: updatedValues.length ? new Date(Math.max(...updatedValues)) : representative.updatedAt,
        mergeReason: values.length > 1 ? 'same_robot_platform_scope_nickname' : '',
      });
    }

    result.sort((left: any, right: any) => {
      const lastDiff = this.dateValue(right.lastMessageAt || right.updatedAt) - this.dateValue(left.lastMessageAt || left.updatedAt);
      if (lastDiff) return lastDiff;
      return this.dateValue(right.updatedAt) - this.dateValue(left.updatedAt);
    });
    return result;
  }

  private groupMessagesByConversation(messages: any[]) {
    const result = new Map<string, any[]>();
    for (const message of messages || []) {
      const conversationId = String(message?.conversationId || '');
      const values = result.get(conversationId) || [];
      values.push(message);
      result.set(conversationId, values);
    }
    for (const values of result.values()) {
      values.sort((left: any, right: any) => this.compareMessages(left, right));
    }
    return result;
  }

  private buildEffectiveMessages(messages: any[]) {
    const sorted = [...(messages || [])].sort((left: any, right: any) => this.compareMessages(left, right));
    const duplicateIds = new Set<string>();
    const messagesByConversation = this.groupMessagesByConversation(sorted);

    // Stable source identifiers are the strongest duplicate evidence and can safely collapse one-message copies.
    const evidenceOwners = new Map<string, any>();
    for (const message of sorted) {
      for (const key of this.messageStableEvidenceKeys(message)) {
        const previous = evidenceOwners.get(key);
        if (!previous) {
          evidenceOwners.set(key, message);
          continue;
        }
        const sameConversation = String(previous.conversationId) === String(message.conversationId);
        if (this.messageFingerprint(previous) !== this.messageFingerprint(message)) continue;
        if (sameConversation && !key.startsWith('client:') && !key.startsWith('attempt:')) continue;
        const preferred = this.preferMessage(previous, message);
        const discarded = preferred === previous ? message : previous;
        duplicateIds.add(String(discarded.id));
        evidenceOwners.set(key, preferred);
      }
    }

    // 视频号发送接口成功后，平台会从 xhr、页面主动轮询以及两个 Tab 多次返回
    // 同一条账号侧回显。若第一次回显已经绑定回复事务，后续历史副本可能只剩
    // account_manual 归因。仅在同一会话、同一内容、短时间内且一强一弱时折叠，
    // 从而保留用户或机器人真正连续发送的两条相同文本。
    const accountEchoOwners = new Map<string, any[]>();
    for (const message of sorted) {
      if (duplicateIds.has(String(message.id))) continue;
      const key = this.accountEchoDedupeKey(message);
      if (!key) continue;
      const candidates = accountEchoOwners.get(key) || [];
      let collapsed = false;
      for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const previous = candidates[index];
        if (duplicateIds.has(String(previous.id))) continue;
        if (!this.isLikelyAccountEchoCopy(previous, message)) continue;
        const preferred = this.preferMessage(previous, message);
        const discarded = preferred === previous ? message : previous;
        duplicateIds.add(String(discarded.id));
        candidates[index] = preferred;
        collapsed = true;
        break;
      }
      if (!collapsed) candidates.push(message);
      accountEchoOwners.set(key, candidates.slice(-8));
    }

    // Cross-segment baseline scans often copy a contiguous window that was already captured live.
    // Only collapse a sequence when the block has at least two ordered messages and one side is
    // demonstrably lower-quality historical baseline data. This preserves legitimate repeated text.
    const segmentEntries = Array.from(messagesByConversation.entries());
    for (let leftIndex = 0; leftIndex < segmentEntries.length; leftIndex += 1) {
      const [, leftMessages] = segmentEntries[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < segmentEntries.length; rightIndex += 1) {
        const [, rightMessages] = segmentEntries[rightIndex];
        const blocks = this.findContiguousOverlapBlocks(leftMessages, rightMessages);
        for (const block of blocks) {
          const leftBlock = leftMessages.slice(block.leftStart, block.leftStart + block.length);
          const rightBlock = rightMessages.slice(block.rightStart, block.rightStart + block.length);
          if (!this.shouldCollapseOverlap(leftBlock, rightBlock)) continue;
          const leftScore = leftBlock.reduce((sum: number, item: any) => sum + this.messageQuality(item), 0);
          const rightScore = rightBlock.reduce((sum: number, item: any) => sum + this.messageQuality(item), 0);
          let discarded: any[];
          if (leftScore === rightScore) {
            if (!this.isLikelyBaselineMediaWindowCopy(leftBlock, rightBlock)) continue;
            const preferred = this.preferMessage(leftBlock[0], rightBlock[0]);
            discarded = preferred === leftBlock[0] ? rightBlock : leftBlock;
          } else {
            discarded = leftScore > rightScore ? rightBlock : leftBlock;
          }
          for (const message of discarded) duplicateIds.add(String(message.id));
        }
      }
    }

    this.collapseRepeatedHistoricalInboundTurns(sorted, duplicateIds);
    this.collapseExactReplayCycles(sorted, duplicateIds);

    const items = sorted.filter((item: any) => !duplicateIds.has(String(item.id)));
    return {
      items,
      rawCount: sorted.length,
      duplicateCount: sorted.length - items.length,
      duplicateIds: Array.from(duplicateIds),
    };
  }

  private collapseRepeatedHistoricalInboundTurns(sorted: any[], duplicateIds: Set<string>) {
    const available = sorted.filter((item: any) => !duplicateIds.has(String(item.id)));
    const turns: Array<{ incoming: any[]; outgoing: any[] }> = [];
    let index = 0;
    while (index < available.length) {
      if (this.clean(available[index]?.senderRole, 32).toLowerCase() !== 'user') {
        index += 1;
        continue;
      }
      const incoming: any[] = [];
      while (
        index < available.length
        && this.clean(available[index]?.senderRole, 32).toLowerCase() === 'user'
      ) {
        incoming.push(available[index]);
        index += 1;
      }
      const outgoing: any[] = [];
      while (
        index < available.length
        && this.clean(available[index]?.senderRole, 32).toLowerCase() === 'account'
      ) {
        outgoing.push(available[index]);
        index += 1;
      }
      turns.push({ incoming, outgoing });
    }

    for (let rightIndex = 1; rightIndex < turns.length; rightIndex += 1) {
      const right = turns[rightIndex];
      for (let leftIndex = rightIndex - 1; leftIndex >= Math.max(0, rightIndex - 3); leftIndex -= 1) {
        const left = turns[leftIndex];
        if (!this.isRepeatedHistoricalInboundTurn(left, right)) continue;
        for (const message of [...right.incoming, ...right.outgoing]) {
          duplicateIds.add(String(message.id));
        }
        break;
      }
    }
  }

  private collapseExactReplayCycles(sorted: any[], duplicateIds: Set<string>) {
    const available = sorted.filter((item: any) => !duplicateIds.has(String(item.id)));
    const turns: Array<{ incoming: any[]; outgoing: any[] }> = [];
    let index = 0;
    while (index < available.length) {
      if (this.clean(available[index]?.senderRole, 32).toLowerCase() !== 'user') {
        index += 1;
        continue;
      }
      const incoming: any[] = [];
      while (index < available.length && this.clean(available[index]?.senderRole, 32).toLowerCase() === 'user') {
        incoming.push(available[index]);
        index += 1;
      }
      const outgoing: any[] = [];
      while (index < available.length && this.clean(available[index]?.senderRole, 32).toLowerCase() === 'account') {
        outgoing.push(available[index]);
        index += 1;
      }
      turns.push({ incoming, outgoing });
    }

    for (let rightIndex = 1; rightIndex < turns.length; rightIndex += 1) {
      const right = turns[rightIndex];
      for (let leftIndex = rightIndex - 1; leftIndex >= Math.max(0, rightIndex - 3); leftIndex -= 1) {
        const left = turns[leftIndex];
        if (!this.isExactReplayCycle(left, right)) continue;
        for (const message of [...right.incoming, ...right.outgoing]) {
          duplicateIds.add(String(message.id));
        }
        break;
      }
    }
  }

  private isExactReplayCycle(
    left: { incoming: any[]; outgoing: any[] },
    right: { incoming: any[]; outgoing: any[] },
  ) {
    if (left.incoming.length < 2 || right.incoming.length !== left.incoming.length) return false;
    if (!left.outgoing.length || right.outgoing.length !== left.outgoing.length) return false;
    const allMessages = [...left.incoming, ...left.outgoing, ...right.incoming, ...right.outgoing];
    if (allMessages.some((item: any) => (
      this.clean(item?.attributionConfidence, 32).toLowerCase() === 'verified'
      || Boolean(this.clean(item?.replyAttemptId, 256))
      || Boolean(this.clean(item?.replyTraceId, 256))
    ))) return false;
    const containsMedia = left.incoming.some((item: any) => {
      const type = this.clean(item?.messageType, 32).toLowerCase();
      return Boolean(type && type !== 'text' && type !== 'unknown');
    });
    if (!containsMedia) return false;
    const leftIncoming = left.incoming.map((item: any) => this.messageFingerprint(item));
    const rightIncoming = right.incoming.map((item: any) => this.messageFingerprint(item));
    const leftOutgoing = left.outgoing.map((item: any) => this.messageFingerprint(item));
    const rightOutgoing = right.outgoing.map((item: any) => this.messageFingerprint(item));
    if (leftIncoming.some((value: string, itemIndex: number) => value !== rightIncoming[itemIndex])) return false;
    if (leftOutgoing.some((value: string, itemIndex: number) => value !== rightOutgoing[itemIndex])) return false;
    if (!this.sameReplayCaptureOrigin(allMessages, left, right)) return false;
    const leftTime = this.dateValue(left.incoming[0]?.observedAt || left.incoming[0]?.createdAt);
    const rightTime = this.dateValue(right.incoming[0]?.observedAt || right.incoming[0]?.createdAt);
    return Boolean(leftTime && rightTime && rightTime >= leftTime && rightTime - leftTime <= 10 * 60 * 1000);
  }

  private sameReplayCaptureOrigin(
    allMessages: any[],
    left: { incoming: any[]; outgoing: any[] },
    right: { incoming: any[]; outgoing: any[] },
  ) {
    const sourceClients = (items: any[]) => new Set(
      items.map((item: any) => this.clean(item?.sourceClientId, 128)).filter(Boolean),
    );
    const leftClients = sourceClients([...left.incoming, ...left.outgoing]);
    const rightClients = sourceClients([...right.incoming, ...right.outgoing]);
    if (leftClients.size && rightClients.size) {
      return Array.from(leftClients).some((value) => rightClients.has(value));
    }
    const conversations = (items: any[]) => new Set(
      items.map((item: any) => this.clean(item?.localConversationId, 128)).filter(Boolean),
    );
    const leftConversations = conversations([...left.incoming, ...left.outgoing]);
    const rightConversations = conversations([...right.incoming, ...right.outgoing]);
    if (leftConversations.size && rightConversations.size) {
      return Array.from(leftConversations).some((value) => rightConversations.has(value));
    }
    return allMessages.every((item: any) => !this.clean(item?.sourceClientId, 128));
  }

  private isRepeatedHistoricalInboundTurn(
    left: { incoming: any[]; outgoing: any[] },
    right: { incoming: any[]; outgoing: any[] },
  ) {
    if (left.incoming.length < 2 || right.incoming.length !== left.incoming.length) return false;
    const allMessages = [...left.incoming, ...left.outgoing, ...right.incoming, ...right.outgoing];
    if (!allMessages.length || !allMessages.every((item: any) => this.isHistoricalTurnDuplicateCandidate(item))) return false;
    const leftIncoming = left.incoming.map((item: any) => this.messageFingerprint(item));
    const rightIncoming = right.incoming.map((item: any) => this.messageFingerprint(item));
    if (leftIncoming.some((value: string, index: number) => value !== rightIncoming[index])) return false;
    const containsMedia = left.incoming.some((item: any) => {
      const type = this.clean(item?.messageType, 32).toLowerCase();
      return Boolean(type && type !== 'text' && type !== 'unknown');
    });
    if (!containsMedia) return false;
    if (
      !this.sameHistoricalTurnOrigin(left.incoming, right.incoming)
      && !this.canUseExactWeakTurnMatchAcrossOrigins(left, right)
    ) return false;
    if (left.outgoing.length !== right.outgoing.length) return false;
    if (left.outgoing.length) {
      const leftOutgoing = left.outgoing.map((item: any) => this.messageFingerprint(item));
      const rightOutgoing = right.outgoing.map((item: any) => this.messageFingerprint(item));
      if (leftOutgoing.some((value: string, index: number) => value !== rightOutgoing[index])) return false;
    }
    const leftTime = this.dateValue(left.incoming[0]?.observedAt || left.incoming[0]?.createdAt);
    const rightTime = this.dateValue(right.incoming[0]?.observedAt || right.incoming[0]?.createdAt);
    return Boolean(leftTime && rightTime && rightTime >= leftTime && rightTime - leftTime <= 10 * 60 * 1000);
  }

  private isHistoricalTurnDuplicateCandidate(message: any) {
    const historyKind = this.clean(message?.historyKind, 32).toLowerCase();
    const attribution = this.clean(message?.attributionConfidence, 32).toLowerCase();
    if (historyKind === 'live_observed' || attribution === 'verified') return false;
    if (this.clean(message?.replyAttemptId, 256) || this.clean(message?.replyTraceId, 256)) return false;
    return this.isBaselineHistory(historyKind) || historyKind === '' || historyKind === 'historical_snapshot';
  }

  private canUseExactWeakTurnMatchAcrossOrigins(
    left: { incoming: any[]; outgoing: any[] },
    right: { incoming: any[]; outgoing: any[] },
  ) {
    const allMessages = [...left.incoming, ...left.outgoing, ...right.incoming, ...right.outgoing];
    if (!allMessages.every((item: any) => this.isHistoricalTurnDuplicateCandidate(item))) return false;
    const hasAuthoritativeSource = allMessages.some((item: any) =>
      Boolean(
        this.clean(item?.payloadFingerprint, 128)
        || this.clean(item?.replyAttemptId, 256)
        || this.clean(item?.replyTraceId, 256),
      ),
    );
    if (hasAuthoritativeSource) return false;
    const leftClients = new Set(left.incoming.map((item: any) => this.clean(item?.sourceClientId, 128)).filter(Boolean));
    const rightClients = new Set(right.incoming.map((item: any) => this.clean(item?.sourceClientId, 128)).filter(Boolean));
    if (leftClients.size && rightClients.size) {
      return Array.from(leftClients).some((value) => rightClients.has(value));
    }
    return true;
  }

  private sameHistoricalTurnOrigin(left: any[], right: any[]) {
    const sourceClients = (items: any[]) => new Set(
      items.map((item: any) => this.clean(item?.sourceClientId, 128)).filter(Boolean),
    );
    const leftClients = sourceClients(left);
    const rightClients = sourceClients(right);
    if (leftClients.size === 1 && rightClients.size === 1) {
      return Array.from(leftClients)[0] === Array.from(rightClients)[0];
    }
    const leftConversationIds = new Set(left.map((item: any) => this.clean(item?.localConversationId, 128)).filter(Boolean));
    const rightConversationIds = new Set(right.map((item: any) => this.clean(item?.localConversationId, 128)).filter(Boolean));
    return leftConversationIds.size === 1
      && rightConversationIds.size === 1
      && Array.from(leftConversationIds)[0] === Array.from(rightConversationIds)[0];
  }

  private findContiguousOverlapBlocks(left: any[], right: any[]) {
    const leftKeys = left.map((item: any) => this.messageFingerprint(item));
    const rightKeys = right.map((item: any) => this.messageFingerprint(item));
    const rightPositions = new Map<string, number[]>();
    rightKeys.forEach((key: string, index: number) => {
      const values = rightPositions.get(key) || [];
      values.push(index);
      rightPositions.set(key, values);
    });
    const blocks: Array<{ leftStart: number; rightStart: number; length: number }> = [];
    for (let leftStart = 0; leftStart < leftKeys.length; leftStart += 1) {
      for (const rightStart of rightPositions.get(leftKeys[leftStart]) || []) {
        if (
          leftStart > 0
          && rightStart > 0
          && leftKeys[leftStart - 1] === rightKeys[rightStart - 1]
        ) {
          continue;
        }
        let length = 0;
        while (
          leftStart + length < leftKeys.length
          && rightStart + length < rightKeys.length
          && leftKeys[leftStart + length] === rightKeys[rightStart + length]
        ) {
          length += 1;
        }
        if (length >= 2) blocks.push({ leftStart, rightStart, length });
      }
    }
    return blocks.sort((a, b) => b.length - a.length);
  }

  private shouldCollapseOverlap(left: any[], right: any[]) {
    if (left.length < 2 || right.length < 2 || left.length !== right.length) return false;
    const leftBaselineRatio = this.baselineRatio(left);
    const rightBaselineRatio = this.baselineRatio(right);
    const baselineDifference = Math.abs(leftBaselineRatio - rightBaselineRatio);
    const leftQuality = left.reduce((sum: number, item: any) => sum + this.messageQuality(item), 0);
    const rightQuality = right.reduce((sum: number, item: any) => sum + this.messageQuality(item), 0);
    const stronger = leftQuality >= rightQuality ? left : right;
    const hasStrongEvidence = stronger.some((item: any) => this.hasStrongMessageEvidence(item));
    const hasSharedStableEvidence = this.blocksShareStableEvidence(left, right);
    const leftTime = this.dateValue(left[0]?.observedAt || left[0]?.createdAt);
    const rightTime = this.dateValue(right[0]?.observedAt || right[0]?.createdAt);
    const withinSevenDays = !leftTime || !rightTime || Math.abs(leftTime - rightTime) <= 7 * 24 * 60 * 60 * 1000;
    return withinSevenDays && (
      hasSharedStableEvidence
      || this.isLikelyBaselineMediaWindowCopy(left, right)
      || (baselineDifference >= 0.4 && hasStrongEvidence && Math.abs(leftQuality - rightQuality) >= 10)
    );
  }


  private isLikelyBaselineMediaWindowCopy(left: any[], right: any[]) {
    if (left.length < 2 || right.length < 2 || left.length !== right.length) return false;
    const allBaseline = [...left, ...right].every((item: any) => this.isBaselineHistory(item?.historyKind));
    if (!allBaseline) return false;
    const hasLiveOrReplyEvidence = [...left, ...right].some((item: any) => (
      this.clean(item?.historyKind, 32).toLowerCase() === 'live_observed'
      || this.clean(item?.attributionConfidence, 32).toLowerCase() === 'verified'
      || Boolean(this.clean(item?.replyAttemptId, 256))
      || this.clean(item?.actorSource, 64).toLowerCase() === 'ucp_robot'
    ));
    if (hasLiveOrReplyEvidence) return false;
    const sameSourceClient = left.every((item: any, index: number) => {
      const leftSource = this.clean(item?.sourceClientId, 128);
      const rightSource = this.clean(right[index]?.sourceClientId, 128);
      return Boolean(leftSource && rightSource && leftSource === rightSource);
    });
    if (!sameSourceClient) return false;
    const hasMediaPlaceholder = left.some((item: any) => {
      const type = this.clean(item?.messageType, 32).toLowerCase();
      return type && type !== 'text' && type !== 'unknown';
    });
    if (!hasMediaPlaceholder) return false;
    const leftTime = this.dateValue(left[0]?.observedAt || left[0]?.createdAt);
    const rightTime = this.dateValue(right[0]?.observedAt || right[0]?.createdAt);
    return Boolean(leftTime && rightTime && Math.abs(leftTime - rightTime) <= 10 * 60 * 1000);
  }

  private blocksShareStableEvidence(left: any[], right: any[]) {
    const evidence = new Set(left.flatMap((item: any) => this.messageStableEvidenceKeys(item)));
    return right.some((item: any) => this.messageStableEvidenceKeys(item).some((key: string) => evidence.has(key)));
  }

  private baselineRatio(messages: any[]) {
    if (!messages.length) return 0;
    return messages.filter((item: any) => this.isBaselineHistory(item?.historyKind)).length / messages.length;
  }

  private isBaselineHistory(value: unknown) {
    const historyKind = this.clean(value, 32).toLowerCase();
    return new Set(['initial_visible_baseline', 'unknown_history', 'historical_baseline']).has(historyKind);
  }

  private hasStrongMessageEvidence(message: any) {
    const historyKind = this.clean(message?.historyKind, 32).toLowerCase();
    const timeAccuracy = this.clean(message?.timeAccuracy, 32).toLowerCase();
    const attribution = this.clean(message?.attributionConfidence, 32).toLowerCase();
    return historyKind === 'live_observed'
      || attribution === 'verified'
      || Boolean(this.clean(message?.replyAttemptId, 256))
      || new Set(['exact_platform', 'absolute_parsed', 'relative_parsed']).has(timeAccuracy);
  }

  private accountEchoDedupeKey(message: any) {
    if (this.clean(message?.senderRole, 32).toLowerCase() !== 'account') return '';
    const localConversationId = this.clean(message?.localConversationId, 128);
    if (!localConversationId) return '';
    return `${localConversationId}|${this.messageFingerprint(message)}`;
  }

  private isVerifiedRobotMessage(message: any) {
    return this.clean(message?.senderRole, 32).toLowerCase() === 'account'
      && this.clean(message?.actorSource, 64).toLowerCase() === 'ucp_robot'
      && this.clean(message?.attributionConfidence, 32).toLowerCase() === 'verified'
      && Boolean(this.clean(message?.replyAttemptId, 256));
  }

  private isWeakPlatformAccountEcho(message: any) {
    if (this.clean(message?.senderRole, 32).toLowerCase() !== 'account') return false;
    if (this.clean(message?.replyAttemptId, 256)) return false;
    const actorSource = this.clean(message?.actorSource, 64).toLowerCase();
    return !actorSource || actorSource === 'account_manual' || actorSource === 'platform_self_echo';
  }

  private isLikelyAccountEchoCopy(left: any, right: any) {
    if (String(left?.id || '') === String(right?.id || '')) return false;
    if (this.clean(left?.localConversationId, 128) !== this.clean(right?.localConversationId, 128)) return false;
    if (this.messageFingerprint(left) !== this.messageFingerprint(right)) return false;
    const strongWeakPair = (this.isVerifiedRobotMessage(left) && this.isWeakPlatformAccountEcho(right))
      || (this.isVerifiedRobotMessage(right) && this.isWeakPlatformAccountEcho(left));
    if (!strongWeakPair) return false;
    const leftTime = this.dateValue(left?.observedAt || left?.createdAt);
    const rightTime = this.dateValue(right?.observedAt || right?.createdAt);
    if (leftTime && rightTime) return Math.abs(leftTime - rightTime) <= 45_000;
    const leftSequence = this.normalizeSequenceIndex(left?.sequenceIndex);
    const rightSequence = this.normalizeSequenceIndex(right?.sequenceIndex);
    return Boolean(leftSequence && rightSequence && Math.abs(leftSequence - rightSequence) <= 45);
  }

  private messageQuality(message: any) {
    const historyKind = this.clean(message?.historyKind, 32).toLowerCase();
    const timeAccuracy = this.clean(message?.timeAccuracy, 32).toLowerCase();
    const attribution = this.clean(message?.attributionConfidence, 32).toLowerCase();
    const actorSource = this.clean(message?.actorSource, 64).toLowerCase();
    let score = 0;
    if (historyKind === 'live_observed') score += 35;
    else if (historyKind === 'initial_visible_baseline') score += 5;
    else if (historyKind && historyKind !== 'unknown_history') score += 10;
    if (timeAccuracy === 'exact_platform') score += 25;
    else if (timeAccuracy === 'absolute_parsed') score += 20;
    else if (timeAccuracy === 'relative_parsed') score += 15;
    else if (timeAccuracy === 'live_observed') score += 12;
    if (attribution === 'verified') score += 25;
    if (this.clean(message?.replyAttemptId, 256)) score += 35;
    if (actorSource === 'ucp_robot') score += 10;
    if (this.clean(message?.clientMessageId, 256)) score += 2;
    return score;
  }

  private preferMessage(left: any, right: any) {
    const qualityDiff = this.messageQuality(left) - this.messageQuality(right);
    if (qualityDiff) return qualityDiff > 0 ? left : right;
    const leftTime = this.dateValue(left?.observedAt || left?.createdAt);
    const rightTime = this.dateValue(right?.observedAt || right?.createdAt);
    if (leftTime !== rightTime) return leftTime < rightTime ? left : right;
    return String(left?.id || '') <= String(right?.id || '') ? left : right;
  }

  private messageStableEvidenceKeys(message: any) {
    const keys: string[] = [];
    const values: Array<[string, unknown, number]> = [
      ['client', message?.clientMessageId, 256],
      ['attempt', message?.replyAttemptId, 256],
      ['payload', message?.payloadFingerprint, 128],
    ];
    for (const [prefix, value, limit] of values) {
      const cleaned = this.clean(value, limit);
      if (cleaned) keys.push(`${prefix}:${cleaned}`);
    }
    const localConversationId = this.clean(message?.localConversationId, 128);
    const sequenceIndex = this.normalizeSequenceIndex(message?.sequenceIndex);
    const senderRole = this.clean(message?.senderRole, 32).toLowerCase();
    if (localConversationId && sequenceIndex) {
      keys.push(`local-seq:${localConversationId}:${senderRole}:${sequenceIndex}`);
    }
    return keys;
  }

  private messageFingerprint(message: any) {
    return [
      this.clean(message?.senderRole, 32).toLowerCase(),
      this.clean(message?.messageType || 'unknown', 32).toLowerCase(),
      this.messageDisplayContent(message),
    ].join('|');
  }

  private messageDisplayContent(message: any) {
    const text = this.cleanText(message?.textContent, 20000);
    const placeholder = this.clean(message?.typePlaceholder, 64);
    const messageType = this.clean(message?.messageType || 'unknown', 32);
    return this.normalizeDisplayText(text || placeholder || `[${messageType}]`);
  }

  private normalizeDisplayText(value: unknown) {
    return String(value ?? '')
      .normalize('NFKC')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  private toDialogueMessageDto(item: any) {
    return {
      ...item,
      ...this.dialogueMessageAudit(item),
    };
  }

  private dialogueMessageAudit(item: any) {
    const senderRole = this.clean(item?.senderRole, 32).toLowerCase();
    const actorSource = this.clean(item?.actorSource, 64).toLowerCase();
    const attribution = this.clean(item?.attributionConfidence, 32).toLowerCase();
    const messageType = this.clean(item?.messageType || 'unknown', 32).toLowerCase();
    const isAccount = senderRole === 'account';
    const verifiedRobot = isAccount
      && actorSource === 'ucp_robot'
      && attribution === 'verified'
      && Boolean(this.clean(item?.replyAttemptId, 256));
    const hasTrace = Boolean(this.clean(item?.replyTraceId, 512));
    const isMediaMessage = !new Set(['text', 'unknown', '']).has(messageType);
    let evidenceLevel = senderRole === 'user' ? 'USER_MESSAGE' : 'UNATTRIBUTED_ACCOUNT';
    let feedbackMode = senderRole === 'user' ? 'NONE' : 'COPY_ONLY';
    let feedbackReason = senderRole === 'user' ? '用户消息不属于账号回复校准范围。' : '历史账号回复来源不明确，仅可复制，不能作为模型校准证据。';
    if (verifiedRobot && hasTrace) {
      evidenceLevel = 'PRECISE_TRACE';
      feedbackMode = 'PRECISE';
      feedbackReason = '已验证机器人回复并关联完整生成追踪，可进行有效反馈、校准和生成详情查看。';
    } else if (verifiedRobot) {
      evidenceLevel = 'VERIFIED_ROBOT_HISTORY';
      feedbackMode = 'COPY_ONLY';
      feedbackReason = '已确认是历史机器人回复，但缺少生成快照，仅可复制。';
    }
    const sourceLabel = senderRole === 'user'
      ? '平台用户消息'
      : verifiedRobot
        ? 'UCP 已验证机器人回复'
        : actorSource === 'account_manual'
          ? '账号侧人工或既有回复'
          : actorSource === 'platform_self_echo'
            ? '平台账号侧回显'
            : '账号侧历史消息（来源未确认）';
    const mediaLabel = isMediaMessage
      ? `平台${messageType === 'image' ? '图片' : messageType}消息；当前记录仅保存消息类型占位，未保存媒体文件本体。`
      : '';
    return {
      evidenceLevel,
      feedbackMode,
      feedbackReason,
      sourceLabel,
      mediaLabel,
      isMediaMessage,
    };
  }

  private compareMessages(left: any, right: any) {
    const timeDiff = this.dateValue(left?.observedAt) - this.dateValue(right?.observedAt);
    if (timeDiff) return timeDiff;
    const sequenceDiff = Number(left?.sequenceIndex || 0) - Number(right?.sequenceIndex || 0);
    if (sequenceDiff) return sequenceDiff;
    const createdDiff = this.dateValue(left?.createdAt) - this.dateValue(right?.createdAt);
    if (createdDiff) return createdDiff;
    return String(left?.id || '').localeCompare(String(right?.id || ''));
  }

  private async findContactConversationIds(representative: any, user: CurrentUserPayload): Promise<string[]> {
    const db = this.prisma as any;
    const tenantId = resolveTenantId(user);
    const normalizedDisplayName = this.normalizeName(
      representative?.normalizedDisplayName || representative?.displayName,
    );
    if (!normalizedDisplayName) return [representative.id];
    const rows = await db.dialogueConversation.findMany({
      where: {
        tenantId: representative.tenantId,
        robotId: representative.robotId,
        platform: representative.platform,
        normalizedDisplayName,
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        robotId: true,
        platform: true,
        chatType: true,
        displayName: true,
        normalizedDisplayName: true,
      },
      take: 50000,
    });
    const groupKey = this.contactGroupKey(representative);
    const ids = rows
      .filter((item: any) => this.contactGroupKey(item) === groupKey)
      .map((item: any) => String(item.id));
    return ids.length ? ids : [String(representative.id)];
  }

  private async expandContactConversationIds(selected: any[], user: CurrentUserPayload): Promise<string[]> {
    if (!selected?.length) return [];
    const db = this.prisma as any;
    const tenantId = resolveTenantId(user);
    const selectedKeys = new Set(selected.map((item: any) => this.contactGroupKey(item)));
    const namedSelectors = Array.from(new Map(
      selected
        .filter((item: any) => this.normalizeName(item.normalizedDisplayName || item.displayName))
        .map((item: any) => {
          const selector = {
            tenantId: item.tenantId,
            robotId: item.robotId,
            platform: item.platform,
            normalizedDisplayName: this.normalizeName(item.normalizedDisplayName || item.displayName),
          };
          return [JSON.stringify(selector), selector];
        }),
    ).values());
    const unnamedIds = selected
      .filter((item: any) => !this.normalizeName(item.normalizedDisplayName || item.displayName))
      .map((item: any) => item.id);
    const rows = await db.dialogueConversation.findMany({
      where: {
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
        OR: [
          ...namedSelectors,
          ...(unnamedIds.length ? [{ id: { in: unnamedIds } }] : []),
        ],
      },
      take: 50000,
    });
    return Array.from(new Set<string>(
      rows
        .filter((item: any) => selectedKeys.has(this.contactGroupKey(item)))
        .map((item: any) => String(item.id)),
    ));
  }

  private dateValue(value: unknown) {
    if (!value) return 0;
    const time = new Date(value as any).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  private async createDeletionWatermarks(conversationIds: string[], db: any, reason: string) {
    if (!conversationIds.length) return 0;
    const [aliases, groups, conversations] = await Promise.all([
      db.dialogueConversationAlias.findMany({
        where: { conversationId: { in: conversationIds } },
        select: { tenantId: true, robotId: true, sourceClientId: true, localConversationId: true, conversationId: true },
      }),
      db.dialogueMessage.groupBy({
        by: ['tenantId', 'robotId', 'sourceClientId', 'localConversationId', 'conversationId'],
        where: { conversationId: { in: conversationIds } },
        _max: { observedAt: true },
      }),
      db.dialogueConversation.findMany({
        where: { id: { in: conversationIds } },
        select: { id: true, tenantId: true, robotId: true, lastMessageAt: true, updatedAt: true },
      }),
    ]);
    const conversationFallback = new Map<string, Date>();
    for (const item of conversations) {
      conversationFallback.set(item.id, item.lastMessageAt || item.updatedAt || new Date(0));
    }
    const values = new Map<string, { tenantId: string; robotId: string; sourceClientId: string; localConversationId: string; deletedBeforeAt: Date }>();
    for (const group of groups) {
      const deletedBeforeAt = group._max?.observedAt || conversationFallback.get(group.conversationId) || new Date(0);
      const key = `${group.tenantId}|${group.robotId}|${group.sourceClientId}|${group.localConversationId}`;
      values.set(key, {
        tenantId: group.tenantId,
        robotId: group.robotId,
        sourceClientId: group.sourceClientId,
        localConversationId: group.localConversationId,
        deletedBeforeAt,
      });
    }
    for (const alias of aliases) {
      const key = `${alias.tenantId}|${alias.robotId}|${alias.sourceClientId}|${alias.localConversationId}`;
      if (!values.has(key)) {
        values.set(key, {
          tenantId: alias.tenantId,
          robotId: alias.robotId,
          sourceClientId: alias.sourceClientId,
          localConversationId: alias.localConversationId,
          deletedBeforeAt: conversationFallback.get(alias.conversationId) || new Date(0),
        });
      }
    }
    let count = 0;
    for (const item of values.values()) {
      const unique = {
        tenantId_robotId_sourceClientId_localConversationId: {
          tenantId: item.tenantId,
          robotId: item.robotId,
          sourceClientId: item.sourceClientId,
          localConversationId: item.localConversationId,
        },
      };
      const existing = await db.dialogueSyncWatermark.findUnique({ where: unique });
      const deletedBeforeAt = existing?.deletedBeforeAt && new Date(existing.deletedBeforeAt) > item.deletedBeforeAt
        ? new Date(existing.deletedBeforeAt)
        : item.deletedBeforeAt;
      await db.dialogueSyncWatermark.upsert({
        where: unique,
        create: { ...item, deletedBeforeAt, reason },
        update: { deletedBeforeAt, reason },
      });
      count += 1;
    }
    return count;
  }

  private async reconcileCanonicalStateAfterSync(input: {
    dialogueConversationId: string;
    robotId: string;
    relatedConversationIds: string[];
    changedIngestKeys: string[];
    mutatedExistingMessageIds: string[];
    user: CurrentUserPayload;
  }) {
    const recent = await this.loadCanonicalLifecycleSnapshot(
      input.relatedConversationIds,
      input.changedIngestKeys,
      C5B_LIFECYCLE_RECENT_EVENT_LIMIT,
      false,
    );
    let result = await this.canonicalState.reconcileEffectiveEvents({
      dialogueConversationId: input.dialogueConversationId,
      expectedRobotId: input.robotId,
      sourceConversationIds: input.relatedConversationIds,
      events: recent.events,
      changedEventIds: recent.changedEventIds,
      mutatedExistingMessageIds: input.mutatedExistingMessageIds,
      eventsComplete: recent.complete,
      user: input.user,
    });
    if (result.status !== 'REBUILD_DEFERRED') return result;

    const full = await this.loadCanonicalLifecycleSnapshot(
      input.relatedConversationIds,
      [],
      C5B_LIFECYCLE_FULL_EVENT_LIMIT,
      true,
    );
    if (!full.complete) return result;
    result = await this.canonicalState.reconcileEffectiveEvents({
      dialogueConversationId: input.dialogueConversationId,
      expectedRobotId: input.robotId,
      sourceConversationIds: input.relatedConversationIds,
      events: full.events,
      changedEventIds: full.changedEventIds,
      eventsComplete: true,
      user: input.user,
    });
    return result;
  }

  private async loadCanonicalLifecycleSnapshot(
    conversationIds: string[],
    changedIngestKeys: string[],
    limit: number,
    full: boolean,
  ): Promise<CanonicalLifecycleSnapshot> {
    const db = this.prisma as any;
    const ids = Array.from(new Set((conversationIds || []).map((item) => String(item || '').trim()).filter(Boolean)));
    if (!ids.length) return { events: [], changedEventIds: [], complete: true };
    const where = this.lifecycleMessageWhere(ids);
    const rawCount = await db.dialogueMessage.count({ where });
    if (full && rawCount > limit) return { events: [], changedEventIds: [], complete: false };
    const rows = await db.dialogueMessage.findMany({
      where,
      orderBy: full
        ? [{ observedAt: 'asc' }, { sequenceIndex: 'asc' }, { createdAt: 'asc' }]
        : [{ observedAt: 'desc' }, { sequenceIndex: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(limit, Math.max(1, rawCount || 1)),
    });
    const changedRows = !full && changedIngestKeys.length
      ? await db.dialogueMessage.findMany({
          where: { ...where, ingestKey: { in: Array.from(new Set(changedIngestKeys)).slice(0, 500) } },
          take: 500,
        })
      : [];
    const changedIngestKeySet = new Set(changedIngestKeys);
    const effectiveRows = this.buildEffectiveMessages(uniqueDialogueRowsById([...rows, ...changedRows])).items;
    return {
      events: effectiveRows.map((item: any) => toCanonicalDialogueEvent(item)),
      changedEventIds: effectiveRows
        .filter((item: any) => changedIngestKeySet.has(String(item?.ingestKey || '')))
        .map((item: any) => String(item?.id || ''))
        .filter(Boolean),
      complete: rawCount <= limit,
    };
  }

  private lifecycleMessageChanged(previous: any, next: any) {
    return String(previous?.senderRole || '') !== String(next?.senderRole || '')
      || String(previous?.messageType || '') !== String(next?.messageType || '')
      || String(previous?.textContent || '') !== String(next?.textContent || '')
      || this.dateValue(previous?.observedAt) !== this.dateValue(next?.observedAt)
      || Number(previous?.sequenceIndex || 0) !== Number(next?.sequenceIndex || 0);
  }

  private lifecycleMessageWhere(conversationIds: string[]) {
    return {
      conversationId: { in: conversationIds },
      messageType: 'text',
      textContent: { not: '' },
      senderRole: { in: ['user', 'account'] },
    };
  }

  private async findStrongIdentityConversationIds(
    tenantId: string,
    robotId: string,
    platform: string,
    channelType: string,
    localConversationId: string,
    primaryConversationId: string,
  ) {
    const db = this.prisma as any;
    const messageRows = await db.dialogueMessage.findMany({
      where: { tenantId, robotId, localConversationId },
      select: { conversationId: true },
      distinct: ['conversationId'],
      take: 100,
    });
    const candidateIds = Array.from(new Set(
      messageRows.map((item: any) => String(item.conversationId || '')).filter(Boolean),
    ));
    if (!candidateIds.length) return [primaryConversationId];
    const conversations = await db.dialogueConversation.findMany({
      where: {
        id: { in: candidateIds },
        platform,
        channelType,
        deletedAt: null,
      },
      select: { id: true },
      take: 100,
    });
    return Array.from(new Set([
      primaryConversationId,
      ...conversations.map((item: any) => String(item.id || '')).filter(Boolean),
    ]));
  }

  private async getContextRows(conversationIds: string | string[], excludeClientMessageIds: string[], limit: number) {
    const db = this.prisma as any;
    const excluded = new Set((excludeClientMessageIds ?? []).map((item) => this.clean(item, 256)).filter(Boolean));
    const ids = Array.from(new Set((Array.isArray(conversationIds) ? conversationIds : [conversationIds]).filter(Boolean)));
    const rows = await db.dialogueMessage.findMany({
      where: {
        conversationId: { in: ids },
        messageType: 'text',
        textContent: { not: '' },
        OR: [
          { senderRole: 'user' },
          { senderRole: 'account', actorSource: 'ucp_robot', attributionConfidence: 'verified' },
        ],
      },
      orderBy: [{ observedAt: 'desc' }, { sequenceIndex: 'desc' }],
      take: Math.min(80, limit + excluded.size + 20),
    });
    const effectiveRows = this.buildEffectiveMessages(rows).items
      .filter((item: any) => !excluded.has(item.clientMessageId));
    return effectiveRows
      .slice(Math.max(0, effectiveRows.length - limit))
      .map((item: any) => ({
        clientMessageId: item.clientMessageId,
        senderRole: item.senderRole,
        messageType: item.messageType,
        textContent: item.textContent,
        observedAtUtc: item.observedAt?.toISOString?.() ?? '',
      }));
  }

  private async findConversationOrThrow(id: string, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const tenantId = resolveTenantId(user);
    const item = await db.dialogueConversation.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
    });
    if (!item) throw new NotFoundException('对话记录不存在');
    return item;
  }

  private buildConversationWhere(query: Partial<DialogueConversationQueryDto>, user: CurrentUserPayload) {
    const tenantId = resolveTenantId(user, query.tenantId);
    return {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.robotId ? { robotId: query.robotId } : {}),
      ...(query.platform ? { platform: String(query.platform).toUpperCase() } : {}),
      ...(query.nickname ? { displayName: { contains: query.nickname, mode: 'insensitive' } } : {}),
      ...(query.identityStatus ? { identityStatus: query.identityStatus } : {}),
      ...(query.keyword ? {
        OR: [
          { displayName: { contains: query.keyword, mode: 'insensitive' } },
          { messages: { some: { textContent: { contains: query.keyword, mode: 'insensitive' } } } },
        ],
      } : {}),
    };
  }

  private async assertRobotScope(robotId: string, tenantId: string) {
    const db = this.prisma as any;
    const robot = await db.robot.findFirst({ where: { id: robotId, tenantId, deletedAt: null }, select: { id: true } });
    if (!robot) throw new NotFoundException('机器人不存在或不属于当前租户');
  }

  private normalizeChatType(value: unknown) {
    const chatType = this.clean(value || 'private_unknown', 16).toLowerCase();
    const allowed = new Set([
      'group',
      'friend_private',
      'stranger_private',
      'private_all',
      'private_unknown',
      'private',
    ]);
    return allowed.has(chatType) ? chatType : 'private_unknown';
  }

  private isScopedPrivateChatType(value: unknown) {
    return new Set(['friend_private', 'stranger_private', 'private_all', 'private_unknown'])
      .has(this.clean(value, 16).toLowerCase());
  }

  private isChatTypeCompatible(existing: unknown, requested: unknown) {
    const existingType = this.normalizeChatType(existing);
    const requestedType = this.normalizeChatType(requested);
    if (existingType === requestedType) return true;
    if (existingType === 'private' && this.isScopedPrivateChatType(requestedType)) return true;
    // Backward compatibility for an older UCP client syncing an already scoped alias.
    if (requestedType === 'private' && this.isScopedPrivateChatType(existingType)) return true;
    return false;
  }

  private shouldUpgradeLegacyChatType(existing: unknown, requested: unknown) {
    return this.normalizeChatType(existing) === 'private'
      && this.isScopedPrivateChatType(requested);
  }

  private candidateChatTypes(requested: unknown) {
    const requestedType = this.normalizeChatType(requested);
    return this.isScopedPrivateChatType(requestedType)
      ? [requestedType, 'private']
      : [requestedType];
  }

  private hasWindowNovelty(current: NormalizedWindowMessage[], stored: NormalizedWindowMessage[]) {
    const counts = new Map<string, number>();
    for (const item of stored) counts.set(item.signature, (counts.get(item.signature) || 0) + 1);
    for (const item of current) {
      const remaining = counts.get(item.signature) || 0;
      if (remaining <= 0) return true;
      counts.set(item.signature, remaining - 1);
    }
    return false;
  }

  private async hasNewAliasEvidence(
    db: any,
    conversationId: string,
    sourceClientId: string,
    currentClientMessageIds: string[],
    current: NormalizedWindowMessage[],
    stored: NormalizedWindowMessage[],
  ) {
    const clientMessageIds = Array.from(new Set(
      (currentClientMessageIds || []).map((item) => this.clean(item, 256)).filter(Boolean),
    ));
    let hasUnstoredCurrentMessage = false;
    if (clientMessageIds.length) {
      const existing = await db.dialogueMessage.findMany({
        where: {
          conversationId,
          sourceClientId,
          clientMessageId: { in: clientMessageIds },
        },
        select: { clientMessageId: true },
      });
      hasUnstoredCurrentMessage = existing.length < clientMessageIds.length;
    }
    return hasUnstoredCurrentMessage || this.hasWindowNovelty(current, stored);
  }

  private normalizeSequenceIndex(value: unknown) {
    let number = Number(value || 0);
    if (!Number.isFinite(number)) return 0;
    number = Math.trunc(number);
    while (Math.abs(number) > 2147483647) number = Math.trunc(number / 1000);
    return Math.max(-2147483648, Math.min(2147483647, number));
  }

  private normalizeSyncMessage(item: DialogueMessageSyncDto, base: Record<string, string>) {
    const sourceClientId = this.clean(item.sourceClientId || base.sourceClientId, 128);
    const clientMessageId = this.clean(item.clientMessageId, 256);
    const observedAt = this.parseDate(item.observedAtUtc);
    return {
      tenantId: base.tenantId,
      robotId: base.robotId,
      conversationId: base.conversationId,
      ingestKey: this.sha256(`${base.tenantId}|${base.robotId}|${sourceClientId}|${clientMessageId}`),
      clientMessageId,
      sourceClientId,
      localConversationId: base.localConversationId,
      senderRole: this.clean(item.senderRole, 32),
      actorSource: this.clean(item.actorSource, 64),
      attributionConfidence: this.clean(item.attributionConfidence, 32),
      messageType: this.clean(item.messageType || 'unknown', 32),
      textContent: this.cleanText(item.textContent, 20000),
      typePlaceholder: this.clean(item.typePlaceholder, 64),
      sequenceIndex: this.normalizeSequenceIndex(item.sequenceIndex),
      historyKind: this.clean(item.historyKind, 32),
      timeAccuracy: this.clean(item.timeAccuracy, 32),
      observedAt,
      payloadFingerprint: this.clean(item.payloadFingerprint, 128),
      replyAttemptId: this.clean(item.replyAttemptId, 256),
      replyTraceId: this.clean(item.replyTraceId, 512),
      generationSource: this.clean(item.generationSource, 64),
    };
  }

  private scoreCandidate(id: string, current: NormalizedWindowMessage[], stored: NormalizedWindowMessage[]): CandidateScore {
    const overlap = this.longestContiguousOverlap(current, stored);
    let score = overlap >= 5 ? 92 : overlap === 4 ? 84 : overlap === 3 ? 75 : overlap === 2 ? 55 : overlap === 1 ? 15 : 0;
    let confirmedReplyMatches = 0;
    const storedConfirmed = new Set(stored.filter((item) => item.senderRole === 'account' && item.actorSource === 'ucp_robot' && item.attributionConfidence === 'verified').map((item) => item.signature));
    for (const item of current) {
      if (item.senderRole === 'account' && storedConfirmed.has(item.signature)) confirmedReplyMatches += 1;
    }
    score += Math.min(20, confirmedReplyMatches * 15);
    const matchedSingle = overlap === 1 ? current.find((item) => stored.some((storedItem) => storedItem.signature === item.signature)) : undefined;
    if (matchedSingle && this.isGenericContent(matchedSingle.content)) score = Math.min(score, 25);
    score = Math.min(100, score);
    return {
      id,
      score,
      overlap,
      confirmedReplyMatches,
      reason: `window_overlap_${overlap}_confirmed_reply_${confirmedReplyMatches}`,
    };
  }

  private longestContiguousOverlap(left: NormalizedWindowMessage[], right: NormalizedWindowMessage[]) {
    let best = 0;
    for (let i = 0; i < left.length; i += 1) {
      for (let j = 0; j < right.length; j += 1) {
        let size = 0;
        while (i + size < left.length && j + size < right.length && left[i + size].signature === right[j + size].signature) size += 1;
        if (size > best) best = size;
      }
    }
    return best;
  }

  private normalizeWindowMessage(item: DialogueWindowMessageDto | Record<string, unknown>): NormalizedWindowMessage | null {
    const senderRole = this.clean((item as any).senderRole ?? (item as any).sender_role, 32).toLowerCase();
    const messageType = this.clean((item as any).messageType ?? (item as any).message_type ?? 'unknown', 32).toLowerCase();
    if (!senderRole) return null;
    const text = this.normalizeMatchText((item as any).textContent ?? (item as any).text_content);
    const placeholder = this.normalizeMatchText((item as any).typePlaceholder ?? (item as any).type_placeholder);
    const content = text || placeholder || `[${messageType}]`;
    const actorSource = this.clean((item as any).actorSource ?? (item as any).actor_source, 64).toLowerCase();
    const attributionConfidence = this.clean((item as any).attributionConfidence ?? (item as any).attribution_confidence, 32).toLowerCase();
    return {
      senderRole,
      messageType,
      content,
      actorSource,
      attributionConfidence,
      signature: `${senderRole}|${messageType}|${content}`,
    };
  }

  private normalizeMatchText(value: unknown) {
    return String(value ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s\p{P}\p{S}]+/gu, '')
      .slice(0, 1000);
  }

  private normalizeName(value: unknown) {
    return String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 100);
  }

  private isGenericContent(value: string) {
    return new Set(['你好', '在吗', '好的', '好', '哈哈', '谢谢', '就是啊', '嗯', '哦']).has(value);
  }

  private parseDate(value?: string) {
    const date = value ? new Date(value) : new Date();
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  private clean(value: unknown, limit: number) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
  }

  private cleanText(value: unknown, limit: number) {
    return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, limit);
  }

  private sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private csv(value: unknown) {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  }
}
