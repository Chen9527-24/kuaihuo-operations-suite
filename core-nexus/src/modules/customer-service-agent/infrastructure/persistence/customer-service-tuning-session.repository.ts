import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class CustomerServiceTuningSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.CustomerServiceTuningSessionWhereInput, skip: number, take: number) {
    return this.prisma.customerServiceTuningSession.findMany({
      where,
      skip,
      take,
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        merchantRole: { select: { id: true, code: true, name: true, publicIdentity: true } },
        industryNode: { select: { id: true, code: true, name: true, path: true } },
        accountProfile: { select: { id: true, code: true, name: true, channel: true, storeProfileId: true } },
      },
    });
  }

  count(where: Prisma.CustomerServiceTuningSessionWhereInput) {
    return this.prisma.customerServiceTuningSession.count({ where });
  }

  listAnalyses(where: Prisma.CustomerServiceTuningAnalysisWhereInput, skip: number, take: number) {
    return this.prisma.customerServiceTuningAnalysis.findMany({
      where,
      skip,
      take,
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        sessionId: true,
        customerMessageId: true,
        runType: true,
        sequenceNo: true,
        latestMessage: true,
        summary: true,
        primaryScenario: true,
        primaryIntent: true,
        dominantTurnGoal: true,
        recognitionPath: true,
        generationModel: true,
        qualityStatus: true,
        configurationHash: true,
        contentHash: true,
        payloadBytes: true,
        payloadState: true,
        retentionClass: true,
        compactedAt: true,
        createdAt: true,
        session: {
          select: {
            id: true,
            title: true,
            purpose: true,
            status: true,
            merchantRoleId: true,
            industryNodeId: true,
            accountProfileId: true,
            messageCount: true,
            analysisCount: true,
            updatedAt: true,
            merchantRole: { select: { id: true, code: true, name: true, publicIdentity: true } },
            industryNode: { select: { id: true, code: true, name: true, path: true } },
            accountProfile: { select: { id: true, code: true, name: true, channel: true, storeProfileId: true } },
          },
        },
      },
    });
  }

  getAnalysisDetails(id: string, tenantId: string) {
    return this.prisma.customerServiceTuningAnalysis.findFirst({
      where: { id, session: { tenantId } },
      include: {
        session: {
          select: { id: true, title: true, purpose: true, status: true, tenantId: true },
        },
      },
    });
  }

  countAnalyses(where: Prisma.CustomerServiceTuningAnalysisWhereInput) {
    return this.prisma.customerServiceTuningAnalysis.count({ where });
  }

  create(input: {
    tenantId: string;
    merchantRoleId: string;
    industryNodeId: string | null;
    accountProfileId?: string | null;
    title: string;
    purpose?: 'TUNING' | 'ROBOT_TEST_DM';
    createdById: string;
    contextSnapshot?: Prisma.InputJsonValue;
  }) {
    return this.prisma.customerServiceTuningSession.create({
      data: {
        tenantId: input.tenantId,
        merchantRoleId: input.merchantRoleId,
        industryNodeId: input.industryNodeId,
        accountProfileId: input.accountProfileId || null,
        title: input.title,
        purpose: input.purpose || 'TUNING',
        createdById: input.createdById,
        contextSnapshot: input.contextSnapshot,
      },
      include: {
        merchantRole: { select: { id: true, code: true, name: true, publicIdentity: true } },
        industryNode: { select: { id: true, code: true, name: true, path: true } },
        accountProfile: { select: { id: true, code: true, name: true, channel: true, storeProfileId: true } },
      },
    });
  }

  findScoped(id: string, tenantId: string) {
    return this.prisma.customerServiceTuningSession.findFirst({
      where: { id, tenantId },
      include: {
        merchantRole: { select: { id: true, code: true, name: true, publicIdentity: true } },
        industryNode: { select: { id: true, code: true, name: true, path: true } },
        accountProfile: { select: { id: true, code: true, name: true, channel: true, storeProfileId: true } },
      },
    });
  }

  getDetails(id: string, tenantId: string) {
    return this.prisma.customerServiceTuningSession.findFirst({
      where: { id, tenantId },
      include: {
        merchantRole: { select: { id: true, code: true, name: true, publicIdentity: true } },
        industryNode: { select: { id: true, code: true, name: true, path: true } },
        accountProfile: { include: { storeProfile: true } },
        messages: { orderBy: { turnNo: 'asc' } },
        analyses: { orderBy: { sequenceNo: 'desc' }, take: 30 },
      },
    });
  }

  async updateScoped(
    id: string,
    tenantId: string,
    data: Prisma.CustomerServiceTuningSessionUncheckedUpdateInput,
  ) {
    const current = await this.prisma.customerServiceTuningSession.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!current) return null;
    return this.prisma.customerServiceTuningSession.update({ where: { id }, data });
  }

  async updateConversationStateScoped(input: {
    id: string;
    tenantId: string;
    expectedRevision: number;
    stateSchemaVersion: number;
    contextPayloadBytes: number;
    contextSnapshot: Prisma.InputJsonValue;
  }) {
    const result = await this.prisma.customerServiceTuningSession.updateMany({
      where: {
        id: input.id,
        tenantId: input.tenantId,
        stateRevision: input.expectedRevision,
      },
      data: {
        contextSnapshot: input.contextSnapshot,
        stateSchemaVersion: input.stateSchemaVersion,
        stateRevision: { increment: 1 },
        contextPayloadBytes: input.contextPayloadBytes,
        stateUpdatedAt: new Date(),
      },
    });
    if (result.count !== 1) return null;
    return this.prisma.customerServiceTuningSession.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        stateSchemaVersion: true,
        stateRevision: true,
        contextPayloadBytes: true,
        stateUpdatedAt: true,
      },
    });
  }

  async listMessages(id: string, tenantId: string, take = 60) {
    const items = await this.prisma.customerServiceTuningMessage.findMany({
      where: { session: { id, tenantId } },
      orderBy: { turnNo: 'desc' },
      take,
    });
    return items.reverse();
  }

  findMessageByClientId(id: string, tenantId: string, clientMessageId: string) {
    const normalized = String(clientMessageId || '').trim();
    if (!normalized) return Promise.resolve(null);
    return this.prisma.customerServiceTuningMessage.findFirst({
      where: { session: { id, tenantId }, clientMessageId: normalized },
    });
  }

  async listMessagesByIds(id: string, tenantId: string, messageIds: string[]) {
    const ids = Array.from(new Set((messageIds || []).map((item) => String(item || '').trim()).filter(Boolean))).slice(0, 500);
    if (!ids.length) return [];
    return this.prisma.customerServiceTuningMessage.findMany({
      where: { session: { id, tenantId }, id: { in: ids } },
      orderBy: { turnNo: 'asc' },
      take: 500,
    });
  }

  async appendMessage(input: {
    sessionId: string;
    tenantId: string;
    role: 'CUSTOMER' | 'ASSISTANT';
    content: string;
    clientMessageId?: string | null;
  }) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (input.clientMessageId) {
        const existing = await tx.customerServiceTuningMessage.findFirst({
          where: { sessionId: input.sessionId, clientMessageId: input.clientMessageId },
        });
        if (existing) return existing;
      }
      const session = await tx.customerServiceTuningSession.findFirst({
        where: { id: input.sessionId, tenantId: input.tenantId },
        select: { id: true, messageCount: true, title: true },
      });
      if (!session) return null;
      const turnNo = session.messageCount + 1;
      const message = await tx.customerServiceTuningMessage.create({
        data: {
          sessionId: input.sessionId,
          role: input.role,
          content: input.content,
          clientMessageId: input.clientMessageId || null,
          turnNo,
        },
      });
      const title = session.title === '新调优对话' && input.role === 'CUSTOMER'
        ? input.content.replace(/\s+/g, ' ').trim().slice(0, 42) || session.title
        : session.title;
      await tx.customerServiceTuningSession.update({
        where: { id: input.sessionId },
        data: { messageCount: { increment: 1 }, lastMessageAt: new Date(), title },
      });
      return message;
    });
  }

  async deleteScoped(id: string, tenantId: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const session = await tx.customerServiceTuningSession.findFirst({
        where: { id, tenantId, purpose: 'TUNING' },
        select: { id: true, messageCount: true, analysisCount: true },
      });
      if (!session) return null;

      const replyTraces = await tx.customerServiceReplyTrace.deleteMany({
        where: { tenantId, sourceType: 'TUNING_SIMULATION', conversationId: session.id },
      });
      await tx.customerServiceTuningSession.delete({ where: { id: session.id } });
      return {
        deletedIds: [session.id],
        deletedCount: 1,
        deletedMessageCount: session.messageCount,
        deletedAnalysisCount: session.analysisCount,
        deletedReplyTraceCount: replyTraces.count,
      };
    });
  }

  async deleteManyScoped(ids: string[], tenantId: string) {
    const normalizedIds = Array.from(new Set(
      (ids || []).map((item) => String(item || '').trim()).filter(Boolean),
    )).slice(0, 100);
    if (!normalizedIds.length) {
      return {
        deletedIds: [] as string[],
        deletedCount: 0,
        deletedMessageCount: 0,
        deletedAnalysisCount: 0,
        deletedReplyTraceCount: 0,
      };
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const sessions = await tx.customerServiceTuningSession.findMany({
        where: { id: { in: normalizedIds }, tenantId, purpose: 'TUNING' },
        select: { id: true, messageCount: true, analysisCount: true },
      });
      const deletedIds = sessions.map((item) => item.id);
      if (!deletedIds.length) {
        return {
          deletedIds,
          deletedCount: 0,
          deletedMessageCount: 0,
          deletedAnalysisCount: 0,
          deletedReplyTraceCount: 0,
        };
      }

      const replyTraces = await tx.customerServiceReplyTrace.deleteMany({
        where: { tenantId, sourceType: 'TUNING_SIMULATION', conversationId: { in: deletedIds } },
      });
      const deleted = await tx.customerServiceTuningSession.deleteMany({
        where: { id: { in: deletedIds }, tenantId, purpose: 'TUNING' },
      });
      return {
        deletedIds,
        deletedCount: deleted.count,
        deletedMessageCount: sessions.reduce((sum, item) => sum + item.messageCount, 0),
        deletedAnalysisCount: sessions.reduce((sum, item) => sum + item.analysisCount, 0),
        deletedReplyTraceCount: replyTraces.count,
      };
    });
  }

  async appendAnalysis(input: {
    sessionId: string;
    tenantId: string;
    customerMessageId?: string | null;
    runType: 'COMPILE' | 'EXECUTE';
    latestMessage: string;
    understanding: Prisma.InputJsonValue;
    runtimeContract: Prisma.InputJsonValue;
    generation?: Prisma.InputJsonValue | null;
    quality?: Prisma.InputJsonValue | null;
    warnings?: Prisma.InputJsonValue | null;
    summary?: Prisma.InputJsonValue | null;
    primaryScenario?: string | null;
    primaryIntent?: string | null;
    dominantTurnGoal?: string | null;
    recognitionPath?: string | null;
    generationModel?: string | null;
    qualityStatus?: string | null;
    feedbackType?: string | null;
    requestedDeltas?: string[];
    stateRevision?: number | null;
    configurationHash?: string | null;
    contentHash?: string | null;
    payloadBytes?: number;
    createdById: string;
  }) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const session = await tx.customerServiceTuningSession.findFirst({
        where: { id: input.sessionId, tenantId: input.tenantId },
        select: { id: true, analysisCount: true },
      });
      if (!session) return null;
      const analysis = await tx.customerServiceTuningAnalysis.create({
        data: {
          sessionId: input.sessionId,
          customerMessageId: input.customerMessageId || null,
          runType: input.runType,
          sequenceNo: session.analysisCount + 1,
          latestMessage: input.latestMessage,
          understanding: input.understanding,
          runtimeContract: input.runtimeContract,
          generation: input.generation === null ? Prisma.JsonNull : input.generation,
          quality: input.quality === null ? Prisma.JsonNull : input.quality,
          warnings: input.warnings === null ? Prisma.JsonNull : input.warnings,
          summary: input.summary === null ? Prisma.JsonNull : input.summary,
          primaryScenario: input.primaryScenario || null,
          primaryIntent: input.primaryIntent || null,
          dominantTurnGoal: input.dominantTurnGoal || null,
          recognitionPath: input.recognitionPath || null,
          generationModel: input.generationModel || null,
          qualityStatus: input.qualityStatus || null,
          feedbackType: input.feedbackType || null,
          requestedDeltas: input.requestedDeltas || [],
          stateRevision: input.stateRevision ?? null,
          configurationHash: input.configurationHash || null,
          contentHash: input.contentHash || null,
          payloadBytes: input.payloadBytes || 0,
          createdById: input.createdById,
        },
      });
      await tx.customerServiceTuningSession.update({
        where: { id: input.sessionId },
        data: { analysisCount: { increment: 1 } },
      });
      return analysis;
    });
  }
}
