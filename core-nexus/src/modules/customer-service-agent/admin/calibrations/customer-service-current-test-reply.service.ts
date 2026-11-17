import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  customerServiceLongHorizonStateEnabled,
  readCustomerServiceConversationStateV2,
} from '../../runtime/state/customer-service-conversation-state.reducer';
import type {
  CustomerServiceAssistantMoveLedgerEntry,
  CustomerServiceConversationStateV2,
} from '../../runtime/state/customer-service-conversation-state.type';
import {
  extractCustomerServiceSemanticActionFamilies,
  isCustomerServiceInterpersonalActionFamily,
  isCustomerServicePracticalActionFamily,
} from '../../runtime/state/customer-service-semantic-action-family';
import { inferAssistantMove } from '../../runtime/understanding/customer-service-dialogue-obligation';
import { buildCustomerServiceAssistantBehaviorObservation } from '../../runtime/behavior/customer-service-behavior-memory.util';

export type CustomerServiceCurrentTestReplyApplication = {
  applicable: boolean;
  applied: boolean;
  source: 'TUNING' | 'ROBOT_TEST_DM' | null;
  sessionId: string | null;
  replyTraceId: string | null;
  messageIds: string[];
  content: string | null;
  stateRevision: number | null;
  reason:
    | 'APPLIED'
    | 'ALREADY_APPLIED'
    | 'NOT_TEST_SOURCE'
    | 'TARGET_NOT_CURRENT'
    | 'TARGET_NOT_FOUND'
    | 'STATE_TARGET_NOT_FOUND'
    | 'SESSION_NOT_FOUND'
    | 'SESSION_ARCHIVED'
    | 'APPLY_FAILED';
};

type CalibrationRecordInput = {
  id: string;
  tenantId: string;
  sourceType?: string | null;
  sourceAnalysisId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  replyTraceId?: string | null;
  replyAttemptId?: string | null;
  originalReply: string;
  suggestedReply?: string | null;
};

type SessionSource = {
  source: 'TUNING' | 'ROBOT_TEST_DM';
  sessionId: string;
  analysisId: string | null;
  customerMessageId: string | null;
};

@Injectable()
export class CustomerServiceCurrentTestReplyService {
  private readonly logger = new Logger(CustomerServiceCurrentTestReplyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async apply(record: CalibrationRecordInput): Promise<CustomerServiceCurrentTestReplyApplication> {
    const content = String(record.suggestedReply || '').trim();
    if (!content) return this.result('TARGET_NOT_FOUND', null, record, false, false);

    let resolvedSource: SessionSource | null = null;
    return this.prisma.$transaction(async (tx) => {
      const source = await this.resolveSource(tx, record);
      resolvedSource = source;
      if (!source) return this.result('NOT_TEST_SOURCE', null, record, false, false);

      const session = await tx.customerServiceTuningSession.findFirst({
        where: { id: source.sessionId, tenantId: record.tenantId },
        select: {
          id: true,
          purpose: true,
          status: true,
          messageCount: true,
          stateRevision: true,
          stateSchemaVersion: true,
          contextSnapshot: true,
        },
      });
      if (!session) return this.result('SESSION_NOT_FOUND', source, record, true, false);
      if (session.status !== 'ACTIVE') return this.result('SESSION_ARCHIVED', source, record, true, false);
      if (session.purpose !== source.source) return this.result('SESSION_NOT_FOUND', source, record, true, false);

      const messages = await tx.customerServiceTuningMessage.findMany({
        where: { sessionId: session.id },
        orderBy: { turnNo: 'asc' },
      });
      const latest = messages.at(-1) || null;
      const targetMessages = this.findTargetAssistantMessages(messages, source, record);
      const alreadyApplied = Boolean(
        latest
        && latest.role === 'ASSISTANT'
        && String(latest.clientMessageId || '').startsWith(`calibration:${record.id}:assistant:`)
        && String(latest.content || '').trim() === content,
      );
      if (alreadyApplied) {
        return {
          ...this.result('ALREADY_APPLIED', source, record, true, true),
          messageIds: [latest!.id],
          content,
          stateRevision: Number(session.stateRevision || 0),
        };
      }
      if (
        targetMessages.length === 1
        && String(targetMessages[0].content || '').trim() === content
        && latest?.id === targetMessages[0].id
      ) {
        return {
          ...this.result('ALREADY_APPLIED', source, record, true, true),
          messageIds: [targetMessages[0].id],
          content,
          stateRevision: Number(session.stateRevision || 0),
        };
      }

      if (targetMessages.length) {
        const targetIds = new Set(targetMessages.map((item) => item.id));
        const firstTargetIndex = messages.findIndex((item) => targetIds.has(item.id));
        const trailing = firstTargetIndex >= 0 ? messages.slice(firstTargetIndex) : [];
        if (
          firstTargetIndex < 0
          || !trailing.length
          || trailing.some((item) => !targetIds.has(item.id) || item.role !== 'ASSISTANT')
        ) {
          return this.result('TARGET_NOT_CURRENT', source, record, true, false);
        }
      } else {
        if (
          !latest
          || latest.role !== 'CUSTOMER'
          || (source.customerMessageId && !this.matchesCustomerMessage(latest, source.customerMessageId))
        ) {
          return this.result('TARGET_NOT_CURRENT', source, record, true, false);
        }
      }

      const previousEvidenceIds = targetMessages.map((item) => item.id);
      let effectiveMessageId = targetMessages[0]?.id || '';
      let removedCount = 0;

      if (targetMessages.length) {
        const redundantIds = targetMessages.slice(1).map((item) => item.id);
        if (redundantIds.length) {
          const deleted = await tx.customerServiceTuningMessage.deleteMany({ where: { id: { in: redundantIds } } });
          removedCount = deleted.count;
        }
        const normalizedClientMessageId = source.source === 'TUNING' && source.analysisId
          ? `analysis:${source.analysisId}:assistant:0`.slice(0, 120)
          : targetMessages[0].clientMessageId;
        await tx.customerServiceTuningMessage.update({
          where: { id: targetMessages[0].id },
          data: { content, clientMessageId: normalizedClientMessageId || null },
        });
      } else {
        const effectiveTurnNo = Number(session.messageCount || 0) + 1;
        const created = await tx.customerServiceTuningMessage.create({
          data: {
            sessionId: session.id,
            role: 'ASSISTANT',
            content,
            clientMessageId: `calibration:${record.id}:assistant:0`.slice(0, 120),
            turnNo: effectiveTurnNo,
          },
        });
        effectiveMessageId = created.id;
      }

      const nextMessageCount = Number(session.messageCount || 0) - removedCount + (targetMessages.length ? 0 : 1);
      const stateResult = this.replaceStateProjection({
        snapshot: session.contextSnapshot,
        originalReply: record.originalReply,
        suggestedReply: content,
        replyTraceId: record.replyTraceId || null,
        replyAttemptId: record.replyAttemptId || null,
        previousEvidenceIds,
        nextEvidenceIds: effectiveMessageId ? [effectiveMessageId] : [],
      });
      if (!stateResult.ok) {
        throw new CurrentReplyStateTargetError();
      }

      const nextSnapshot = stateResult.snapshot;
      const nextState = readCustomerServiceConversationStateV2(asRecord(nextSnapshot).conversationStateV2);
      const contextPayloadBytes = Buffer.byteLength(JSON.stringify(nextSnapshot), 'utf8');
      const updated = await tx.customerServiceTuningSession.updateMany({
        where: {
          id: session.id,
          tenantId: record.tenantId,
          messageCount: session.messageCount,
          stateRevision: session.stateRevision,
        },
        data: {
          messageCount: nextMessageCount,
          lastMessageAt: new Date(),
          contextSnapshot: nextSnapshot as Prisma.InputJsonValue,
          stateSchemaVersion: stateResult.stateChanged ? nextState.schemaVersion : session.stateSchemaVersion,
          stateRevision: { increment: stateResult.stateChanged ? 1 : 0 },
          contextPayloadBytes,
          stateUpdatedAt: stateResult.stateChanged ? new Date() : undefined,
        },
      });
      if (updated.count !== 1) throw new CurrentReplyConcurrentUpdateError();

      const stateRevision = Number(session.stateRevision || 0) + (stateResult.stateChanged ? 1 : 0);
      return {
        ...this.result('APPLIED', source, record, true, true),
        messageIds: effectiveMessageId ? [effectiveMessageId] : [],
        content,
        stateRevision,
      };
    }).catch((error) => {
      if (error instanceof CurrentReplyStateTargetError) {
        return this.result('STATE_TARGET_NOT_FOUND', resolvedSource, record, true, false);
      }
      if (error instanceof CurrentReplyConcurrentUpdateError) {
        return this.result('TARGET_NOT_CURRENT', resolvedSource, record, true, false);
      }
      this.logger.error(
        `应用校准到当前测试回复失败：record=${record.id} session=${resolvedSource?.sessionId || 'unknown'} error=${error instanceof Error ? error.message : String(error)}`,
      );
      return this.result('APPLY_FAILED', resolvedSource, record, Boolean(resolvedSource), false);
    });
  }

  private async resolveSource(tx: Prisma.TransactionClient, record: CalibrationRecordInput): Promise<SessionSource | null> {
    if (record.sourceAnalysisId) {
      const analysis = await tx.customerServiceTuningAnalysis.findFirst({
        where: { id: record.sourceAnalysisId, session: { tenantId: record.tenantId } },
        select: {
          id: true,
          sessionId: true,
          customerMessageId: true,
          session: { select: { purpose: true } },
        },
      });
      if (analysis?.session?.purpose === 'TUNING') {
        return {
          source: 'TUNING',
          sessionId: analysis.sessionId,
          analysisId: analysis.id,
          customerMessageId: analysis.customerMessageId || null,
        };
      }
      if (analysis?.session?.purpose === 'ROBOT_TEST_DM') {
        return {
          source: 'ROBOT_TEST_DM',
          sessionId: analysis.sessionId,
          analysisId: analysis.id,
          customerMessageId: analysis.customerMessageId || record.messageId || null,
        };
      }
    }
    if (record.sourceType === 'ROBOT_TEST_DM' && record.conversationId) {
      return {
        source: 'ROBOT_TEST_DM',
        sessionId: record.conversationId,
        analysisId: null,
        customerMessageId: record.messageId || null,
      };
    }
    return null;
  }

  private findTargetAssistantMessages(
    messages: Array<{ id: string; role: string; content: string; clientMessageId: string | null; turnNo: number }>,
    source: SessionSource,
    record: CalibrationRecordInput,
  ) {
    const matches = messages.filter((item) => {
      if (item.role !== 'ASSISTANT') return false;
      const clientId = String(item.clientMessageId || '');
      if (source.source === 'ROBOT_TEST_DM' && source.customerMessageId) {
        return clientId.startsWith(`${source.customerMessageId}:assistant:`);
      }
      if (source.source === 'TUNING' && source.analysisId) {
        return clientId.startsWith(`${source.analysisId}:reply:`)
          || clientId.startsWith(`analysis:${source.analysisId}:assistant:`);
      }
      return false;
    });
    if (matches.length) return matches;

    const latest = messages.at(-1);
    if (
      latest?.role === 'ASSISTANT'
      && String(latest.content || '').trim() === String(record.originalReply || '').trim()
    ) return [latest];
    return [];
  }

  private matchesCustomerMessage(
    message: { id: string; clientMessageId: string | null },
    expected: string,
  ) {
    const target = String(expected || '').trim();
    return Boolean(target && (message.id === target || String(message.clientMessageId || '') === target));
  }

  private replaceStateProjection(input: {
    snapshot: unknown;
    originalReply: string;
    suggestedReply: string;
    replyTraceId: string | null;
    replyAttemptId: string | null;
    previousEvidenceIds: string[];
    nextEvidenceIds: string[];
  }): { ok: boolean; stateChanged: boolean; snapshot: Record<string, unknown> } {
    const snapshot = asRecord(input.snapshot);
    if (!customerServiceLongHorizonStateEnabled()) return { ok: true, stateChanged: false, snapshot };

    const state = readCustomerServiceConversationStateV2(snapshot.conversationStateV2);
    if (!state.assistantMoveLedger.length) {
      return { ok: true, stateChanged: false, snapshot };
    }
    const ledger = state.assistantMoveLedger.map((item) => ({ ...item }));
    const targetIndex = findTargetLedgerIndex(ledger, input);
    if (targetIndex < 0) return { ok: false, stateChanged: false, snapshot };

    const existing = ledger[targetIndex];
    const replacement = buildReplacementLedgerEntry(existing, input.suggestedReply, {
      replyTraceId: input.replyTraceId,
      replyAttemptId: input.replyAttemptId,
      evidenceMessageIds: input.nextEvidenceIds,
    });
    ledger[targetIndex] = replacement;
    const now = new Date().toISOString();
    const canonicalFields = {
      ...state.canonicalFields,
      assistantActions: replaceCanonicalAssistantActions(
        state,
        input.originalReply,
        input.suggestedReply,
        input.previousEvidenceIds,
        input.nextEvidenceIds,
        Boolean(existing.behavior),
        now,
      ),
    };
    const nextState: CustomerServiceConversationStateV2 = {
      ...state,
      revision: state.revision + 1,
      assistantMoveLedger: ledger,
      relationshipDynamics: {
        ...state.relationshipDynamics,
        recentInterpersonalActions: uniqueStrings(
          ledger.flatMap((item) => item.interpersonalActionFamilies),
        ).slice(-8) as CustomerServiceConversationStateV2['relationshipDynamics']['recentInterpersonalActions'],
        recentPracticalActions: uniqueStrings(
          ledger.flatMap((item) => item.practicalActionFamilies),
        ).slice(-8) as CustomerServiceConversationStateV2['relationshipDynamics']['recentPracticalActions'],
      },
      canonicalFields,
      updatedAt: now,
    };
    return {
      ok: true,
      stateChanged: true,
      snapshot: { ...snapshot, conversationStateV2: nextState },
    };
  }

  private result(
    reason: CustomerServiceCurrentTestReplyApplication['reason'],
    source: SessionSource | null,
    record: CalibrationRecordInput,
    applicable: boolean,
    applied: boolean,
  ): CustomerServiceCurrentTestReplyApplication {
    return {
      applicable,
      applied,
      source: source?.source || null,
      sessionId: source?.sessionId || null,
      replyTraceId: record.replyTraceId || null,
      messageIds: [],
      content: applied ? String(record.suggestedReply || '').trim() || null : null,
      stateRevision: null,
      reason,
    };
  }
}

class CurrentReplyStateTargetError extends Error {}
class CurrentReplyConcurrentUpdateError extends Error {}

function findTargetLedgerIndex(
  ledger: CustomerServiceAssistantMoveLedgerEntry[],
  input: {
    originalReply: string;
    replyTraceId: string | null;
    previousEvidenceIds: string[];
  },
) {
  const traceId = String(input.replyTraceId || '').trim();
  if (traceId) {
    for (let index = ledger.length - 1; index >= 0; index -= 1) {
      if (ledger[index].behavior?.replyTraceId === traceId) return index;
    }
  }
  const evidenceIds = new Set(input.previousEvidenceIds.map((item) => String(item || '').trim()).filter(Boolean));
  if (evidenceIds.size) {
    for (let index = ledger.length - 1; index >= 0; index -= 1) {
      if ((ledger[index].behavior?.evidenceMessageIds || []).some((id) => evidenceIds.has(id))) return index;
    }
  }
  const originalExcerpt = truncate(String(input.originalReply || '').trim(), 160);
  for (let index = ledger.length - 1; index >= 0; index -= 1) {
    if (normalizeComparableText(ledger[index].excerpt) === normalizeComparableText(originalExcerpt)) return index;
  }
  return -1;
}

function buildReplacementLedgerEntry(
  existing: CustomerServiceAssistantMoveLedgerEntry,
  text: string,
  trace: { replyTraceId: string | null; replyAttemptId: string | null; evidenceMessageIds: string[] },
): CustomerServiceAssistantMoveLedgerEntry {
  const actionFamilies = extractCustomerServiceSemanticActionFamilies(text);
  const behavior = existing.behavior
    ? buildCustomerServiceAssistantBehaviorObservation({
        text,
        replyTraceId: trace.replyTraceId || existing.behavior.replyTraceId,
        replyAttemptId: trace.replyAttemptId || existing.behavior.replyAttemptId,
        evidenceMessageIds: trace.evidenceMessageIds.length ? trace.evidenceMessageIds : existing.behavior.evidenceMessageIds,
        behaviorPlan: existing.behavior.plan,
        interactionPlanV2: existing.behavior.interactionPlanV2,
        planFulfillment: existing.behavior.planFulfillment || 'UNKNOWN',
      })
    : existing.behavior;
  return {
    ...existing,
    move: inferAssistantMove(text),
    actionFamilies,
    practicalActionFamilies: actionFamilies.filter(isCustomerServicePracticalActionFamily),
    interpersonalActionFamilies: actionFamilies.filter(isCustomerServiceInterpersonalActionFamily),
    strategyKey: inferStrategyKey(text),
    openingKey: normalizeEdge(text.slice(0, 28)),
    endingKey: normalizeEdge(text.slice(-28)),
    excerpt: truncate(text, 160),
    ...(behavior ? { behavior } : {}),
  };
}

function replaceCanonicalAssistantActions(
  state: CustomerServiceConversationStateV2,
  originalReply: string,
  suggestedReply: string,
  previousEvidenceIds: string[],
  nextEvidenceIds: string[],
  observedEntry: boolean,
  now: string,
) {
  const current = state.canonicalFields.assistantActions;
  if (!observedEntry && !previousEvidenceIds.length && !nextEvidenceIds.length) return current;
  const values = Array.isArray(current.value) ? [...current.value] : [];
  const oldValue = truncate(String(originalReply || '').trim(), 180);
  const newValue = truncate(String(suggestedReply || '').trim(), 180);
  const oldIndex = values.findIndex((item) => normalizeComparableText(item) === normalizeComparableText(oldValue));
  if (oldIndex >= 0) values.splice(oldIndex, 1, newValue);
  else if (newValue) values.push(newValue);
  const previousEvidence = new Set(previousEvidenceIds.map((item) => String(item || '').trim()).filter(Boolean));
  const evidenceMessageIds = uniqueStrings([
    ...current.evidenceMessageIds.filter((id) => !previousEvidence.has(id)),
    ...nextEvidenceIds,
  ]).slice(-20);
  return {
    ...current,
    value: uniqueStrings(values).slice(-20),
    status: 'EXPLICIT' as const,
    confidence: 1,
    evidenceMessageIds,
    reason: '来自平台已观测到的账号侧实际消息；校准应用已同步替换当前测试回复。',
    updatedAt: now,
  };
}

function inferStrategyKey(text: string) {
  return [
    inferAssistantMove(text),
    /[?？]/.test(text) ? 'QUESTION' : 'NO_QUESTION',
    /(?:建议|可以试试|不妨)/i.test(text) ? 'ADVICE' : 'NO_ADVICE',
  ].join(':');
}

function normalizeEdge(value: string) {
  return value.toLowerCase().replace(/[\s，。！？、,.!?；;：:“”"'（）()]/g, '').slice(0, 24);
}

function normalizeComparableText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
