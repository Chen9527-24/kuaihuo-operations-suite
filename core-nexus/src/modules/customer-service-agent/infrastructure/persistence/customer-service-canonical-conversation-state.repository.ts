import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

export type CustomerServiceCanonicalDialogueEvent = {
  id: string;
  conversationId: string;
  ingestKey: string;
  clientMessageId: string;
  senderRole: 'user' | 'account';
  actorSource: string;
  attributionConfidence: string;
  textContent: string;
  observedAt: Date;
  sequenceIndex: number;
  replyAttemptId: string;
  replyTraceId: string;
  generationSource: string;
  sortKey: string;
};

export type CustomerServiceCanonicalMessageEvidence = CustomerServiceCanonicalDialogueEvent & {
  senderRole: 'user';
};

export type CustomerServiceReplyBehaviorContextRow = {
  id: string;
  replyAttemptId: string;
  runtimeContract: unknown;
  generationDetails: unknown;
  fallbackUsed: boolean;
};

export type CustomerServiceCanonicalConversationStateRow = {
  id: string;
  tenantId: string;
  robotId: string;
  dialogueConversationId: string;
  stateSchemaVersion: number;
  revision: number;
  stateHash: string;
  statePayload: unknown;
  payloadBytes: number;
  lastProcessedMessageId: string;
  lastProcessedIngestKey: string;
  lastProcessedSortKey: string;
  recentProcessedMessageIds: string[];
  sourceConversationIds: string[];
  rebuildRequired: boolean;
  lastRebuiltAt: Date | null;
  lastRebuildReason: string;
  stateUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class CustomerServiceCanonicalConversationStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  findConversation(tenantId: string, dialogueConversationId: string) {
    return (this.prisma as any).dialogueConversation.findFirst({
      where: { id: dialogueConversationId, tenantId, deletedAt: null },
      select: { id: true, tenantId: true, robotId: true, platform: true, channelType: true, chatType: true },
    });
  }

  findState(tenantId: string, dialogueConversationId: string): Promise<CustomerServiceCanonicalConversationStateRow | null> {
    return (this.prisma as any).customerServiceConversationState.findFirst({
      where: { tenantId, dialogueConversationId },
    });
  }

  createState(input: {
    tenantId: string;
    robotId: string;
    dialogueConversationId: string;
    stateSchemaVersion: number;
    stateHash: string;
    statePayload: unknown;
    payloadBytes: number;
    sourceConversationIds?: string[];
  }): Promise<CustomerServiceCanonicalConversationStateRow> {
    return (this.prisma as any).customerServiceConversationState.create({
      data: {
        tenantId: input.tenantId,
        robotId: input.robotId,
        dialogueConversationId: input.dialogueConversationId,
        stateSchemaVersion: input.stateSchemaVersion,
        revision: 0,
        stateHash: input.stateHash,
        statePayload: input.statePayload,
        payloadBytes: input.payloadBytes,
        recentProcessedMessageIds: [],
        sourceConversationIds: normalizeIds(input.sourceConversationIds),
        rebuildRequired: false,
      },
    });
  }

  async findCustomerMessageEvidence(input: {
    tenantId: string;
    dialogueConversationId: string;
    clientMessageId?: string | null;
  }): Promise<CustomerServiceCanonicalMessageEvidence | null> {
    const clientMessageId = String(input.clientMessageId || '').trim();
    if (!clientMessageId) return null;
    const row = await (this.prisma as any).dialogueMessage.findFirst({
      where: {
        tenantId: input.tenantId,
        conversationId: input.dialogueConversationId,
        clientMessageId,
        senderRole: 'user',
      },
      orderBy: [{ observedAt: 'desc' }, { sequenceIndex: 'desc' }, { createdAt: 'desc' }],
      select: canonicalEventSelect(),
    });
    return row ? toCanonicalDialogueEvent(row) as CustomerServiceCanonicalMessageEvidence : null;
  }

  async findReplyBehaviorContexts(input: {
    tenantId: string;
    replyTraceIds?: string[];
    replyAttemptIds?: string[];
  }): Promise<CustomerServiceReplyBehaviorContextRow[]> {
    const replyTraceIds = normalizeIds(input.replyTraceIds).slice(0, 500);
    const replyAttemptIds = normalizeIds(input.replyAttemptIds).slice(0, 500);
    if (!replyTraceIds.length && !replyAttemptIds.length) return [];
    const rows = await (this.prisma as any).customerServiceReplyTrace.findMany({
      where: {
        tenantId: input.tenantId,
        OR: [
          ...(replyTraceIds.length ? [{ id: { in: replyTraceIds } }] : []),
          ...(replyAttemptIds.length ? [{ replyAttemptId: { in: replyAttemptIds } }] : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
      select: { id: true, replyAttemptId: true, runtimeContract: true, generationDetails: true, fallbackUsed: true },
    });
    return rows.map((row: any) => ({
      id: String(row.id || ''),
      replyAttemptId: String(row.replyAttemptId || ''),
      runtimeContract: row.runtimeContract ?? null,
      generationDetails: row.generationDetails ?? null,
      fallbackUsed: row.fallbackUsed === true,
    }));
  }

  async updateStateCas(input: {
    id: string;
    tenantId: string;
    expectedRevision: number;
    stateSchemaVersion: number;
    stateHash: string;
    statePayload: unknown;
    payloadBytes: number;
    evidence: CustomerServiceCanonicalMessageEvidence;
    recentProcessedMessageIds: string[];
    sourceConversationIds?: string[];
  }) {
    return this.replaceStateCas({
      id: input.id,
      tenantId: input.tenantId,
      expectedRevision: input.expectedRevision,
      stateSchemaVersion: input.stateSchemaVersion,
      stateHash: input.stateHash,
      statePayload: input.statePayload,
      payloadBytes: input.payloadBytes,
      lastEvent: input.evidence,
      recentProcessedMessageIds: input.recentProcessedMessageIds,
      sourceConversationIds: input.sourceConversationIds,
      rebuildRequired: false,
    });
  }

  async replaceStateCas(input: {
    id: string;
    tenantId: string;
    expectedRevision: number;
    stateSchemaVersion: number;
    stateHash: string;
    statePayload: unknown;
    payloadBytes: number;
    lastEvent?: CustomerServiceCanonicalDialogueEvent | null;
    recentProcessedMessageIds: string[];
    sourceConversationIds?: string[];
    rebuildRequired: boolean;
    rebuiltAt?: Date | null;
    rebuildReason?: string;
    resetLastEventCursor?: boolean;
  }) {
    const lastEvent = input.lastEvent || null;
    const data: Record<string, unknown> = {
      stateSchemaVersion: input.stateSchemaVersion,
      revision: input.expectedRevision + 1,
      stateHash: input.stateHash,
      statePayload: input.statePayload,
      payloadBytes: input.payloadBytes,
      recentProcessedMessageIds: normalizeIds(input.recentProcessedMessageIds),
      ...(input.sourceConversationIds !== undefined
        ? { sourceConversationIds: normalizeIds(input.sourceConversationIds) }
        : {}),
      rebuildRequired: input.rebuildRequired,
      stateUpdatedAt: new Date(),
      ...(lastEvent ? {
        lastProcessedMessageId: lastEvent.id,
        lastProcessedIngestKey: lastEvent.ingestKey,
        lastProcessedSortKey: lastEvent.sortKey,
      } : {}),
    };
    if (!lastEvent && input.resetLastEventCursor) {
      data.lastProcessedMessageId = '';
      data.lastProcessedIngestKey = '';
      data.lastProcessedSortKey = '';
    }
    if (input.rebuiltAt !== undefined) data.lastRebuiltAt = input.rebuiltAt;
    if (input.rebuildReason !== undefined) data.lastRebuildReason = String(input.rebuildReason || '').slice(0, 128);
    const result = await (this.prisma as any).customerServiceConversationState.updateMany({
      where: {
        id: input.id,
        tenantId: input.tenantId,
        revision: input.expectedRevision,
      },
      data,
    });
    return Number(result?.count || 0) === 1;
  }

  markRebuildRequired(
    id: string,
    tenantId: string,
    reason = 'OUT_OF_ORDER_EVENT',
    sourceConversationIds?: string[],
  ) {
    return (this.prisma as any).customerServiceConversationState.updateMany({
      where: { id, tenantId },
      data: {
        rebuildRequired: true,
        lastRebuildReason: String(reason || 'OUT_OF_ORDER_EVENT').slice(0, 128),
        ...(sourceConversationIds !== undefined
          ? { sourceConversationIds: normalizeIds(sourceConversationIds) }
          : {}),
      },
    });
  }
}

export function buildProjectionSortKey(observedAt: Date | string, sequenceIndex: number, ingestKey: string) {
  const parsed = observedAt instanceof Date ? observedAt : new Date(observedAt);
  const timestamp = Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date(0).toISOString();
  const normalizedSequence = Math.max(-2147483648, Math.min(2147483647, Math.trunc(Number(sequenceIndex || 0))));
  const sequence = String(normalizedSequence + 2147483648).padStart(10, '0');
  return `${timestamp}|${sequence}|${String(ingestKey || '').slice(0, 64)}`;
}

function canonicalEventSelect() {
  return {
    id: true,
    conversationId: true,
    ingestKey: true,
    clientMessageId: true,
    senderRole: true,
    actorSource: true,
    attributionConfidence: true,
    textContent: true,
    observedAt: true,
    sequenceIndex: true,
    replyAttemptId: true,
    replyTraceId: true,
    generationSource: true,
  };
}

export function toCanonicalDialogueEvent(row: any): CustomerServiceCanonicalDialogueEvent {
  return {
    id: String(row.id || ''),
    conversationId: String(row.conversationId || ''),
    ingestKey: String(row.ingestKey || ''),
    clientMessageId: String(row.clientMessageId || ''),
    senderRole: String(row.senderRole || '').toLowerCase() === 'account' ? 'account' : 'user',
    actorSource: String(row.actorSource || ''),
    attributionConfidence: String(row.attributionConfidence || ''),
    textContent: String(row.textContent || '').trim(),
    observedAt: row.observedAt instanceof Date ? row.observedAt : new Date(row.observedAt),
    sequenceIndex: Number(row.sequenceIndex || 0),
    replyAttemptId: String(row.replyAttemptId || ''),
    replyTraceId: String(row.replyTraceId || ''),
    generationSource: String(row.generationSource || ''),
    sortKey: buildProjectionSortKey(row.observedAt, row.sequenceIndex, row.ingestKey),
  };
}

function normalizeIds(value: unknown) {
  return Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  ));
}
