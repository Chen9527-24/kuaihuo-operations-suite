import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const recordInclude = {
  merchantRole: {
    select: {
      id: true,
      code: true,
      name: true,
      publicIdentity: true,
      prototype: { select: { id: true, code: true, name: true } },
    },
  },
  industryNode: { select: { id: true, code: true, name: true, path: true } },
  evaluationCase: { select: { id: true, key: true, name: true } },
  createdBy: { select: { id: true, displayName: true, username: true } },
  analyzedBy: { select: { id: true, displayName: true, username: true } },
  appliedBy: { select: { id: true, displayName: true, username: true } },
  appliedProfile: {
    select: {
      id: true,
      scopeType: true,
      scopeKey: true,
      title: true,
      scenario: true,
      intent: true,
      riskLevel: true,
      status: true,
      directives: true,
      examples: true,
      revision: true,
      updatedAt: true,
    },
  },
  replyTrace: {
    select: { id: true, sourceType: true, sourceRefId: true, accountProfileId: true, robotId: true, channel: true, platform: true, generationSource: true, configurationHash: true, createdAt: true },
  },
  knowledgeRevisionDraft: {
    include: {
      createdBy: { select: { id: true, displayName: true, username: true } },
      updatedBy: { select: { id: true, displayName: true, username: true } },
      verifiedBy: { select: { id: true, displayName: true, username: true } },
      publishedBy: { select: { id: true, displayName: true, username: true } },
    },
  },
  sourceAnalysis: {
    select: {
      id: true,
      sessionId: true,
      understanding: true,
      runtimeContract: true,
      generation: true,
      quality: true,
      warnings: true,
      summary: true,
      configurationHash: true,
      contentHash: true,
      payloadState: true,
      createdAt: true,
    },
  },
} satisfies Prisma.CustomerServiceCalibrationRecordInclude;

const recordListSelect = {
  id: true, tenantId: true, merchantRoleId: true, industryNodeId: true, evaluationCaseId: true, sourceAnalysisId: true,
  sourceType: true, sourceRefId: true, replyTraceId: true, accountProfileId: true, robotId: true, channel: true, platform: true, conversationId: true, messageId: true, replyAttemptId: true,
  status: true, improvementMode: true, problemTypes: true, problemDescription: true, userSuggestion: true,
  customerMessage: true, originalReply: true, scenario: true, intent: true, riskLevel: true,
  generationModel: true, configurationHash: true, suggestedReply: true, aiModel: true, analyzedAt: true,
  ...({
    aiAnalysisStatus: true,
    aiAnalysisAttempts: true,
    aiAnalysisDiagnostics: true,
    aiAnalysisStartedAt: true,
  } as Record<string, true>),
  userFeedback: true, requestedDeltas: true, correctionTarget: true, rejectedMoves: true, dominantTurnGoal: true, currentResponseObligation: true,
  appliedProfileId: true, appliedScopeType: true, appliedScopeKey: true, appliedAt: true,
  ...({
    strategyDraftAssetId: true,
    strategyDraftVersionId: true,
    strategyDraftStatus: true,
    strategyDraftRegression: true,
    strategyDraftValidatedAt: true,
    strategyDraftPublishedAt: true,
  } as Record<string, true>),
  revision: true, createdById: true, updatedById: true, createdAt: true, updatedAt: true,
  contentHash: true, payloadBytes: true, payloadState: true, retentionClass: true, compactedAt: true,
  merchantRole: recordInclude.merchantRole,
  industryNode: recordInclude.industryNode,
  evaluationCase: recordInclude.evaluationCase,
  createdBy: recordInclude.createdBy,
  analyzedBy: recordInclude.analyzedBy,
  appliedBy: recordInclude.appliedBy,
  appliedProfile: {
    select: { id: true, scopeType: true, scopeKey: true, title: true, scenario: true, intent: true, riskLevel: true, status: true, revision: true, updatedAt: true },
  },
  knowledgeRevisionDraft: {
    select: {
      id: true, action: true, scopeType: true, scopeKey: true, category: true, title: true,
      status: true, targetEntryId: true, publishedEntryId: true, verificationNote: true,
      verifiedAt: true, publishedAt: true, revision: true, updatedAt: true,
    },
  },
} as Prisma.CustomerServiceCalibrationRecordSelect;

@Injectable()
export class CustomerServiceCalibrationRecordRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.CustomerServiceCalibrationRecordWhereInput, skip: number, take: number) {
    return this.prisma.customerServiceCalibrationRecord.findMany({
      where,
      skip,
      take,
      orderBy: [{ updatedAt: 'desc' }],
      select: recordListSelect,
    });
  }

  count(where: Prisma.CustomerServiceCalibrationRecordWhereInput) {
    return this.prisma.customerServiceCalibrationRecord.count({ where });
  }

  findScoped(id: string, tenantId?: string) {
    return this.prisma.customerServiceCalibrationRecord.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      include: recordInclude,
    });
  }

  findMerchantRole(id: string, tenantId?: string) {
    return this.prisma.customerServiceMerchantRole.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      include: {
        prototype: true,
        industryNode: true,
        modules: {
          where: { deletedAt: null, status: 'ENABLED' },
          include: { definition: true },
          orderBy: [{ priority: 'desc' }, { sort: 'asc' }],
        },
      },
    });
  }

  findIndustryNode(id: string, tenantId: string) {
    return this.prisma.customerServiceIndustryNode.findFirst({ where: { id, tenantId, deletedAt: null } });
  }

  findAccountProfile(id: string, tenantId: string) {
    return this.prisma.customerServiceAccountProfile.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, code: true, name: true, channel: true, revision: true, storeProfileId: true },
    });
  }

  findEvaluationCase(id: string, tenantId: string) {
    return this.prisma.customerServiceEvaluationCase.findFirst({ where: { id, tenantId, deletedAt: null } });
  }

  findSourceAnalysis(id: string, tenantId: string) {
    return this.prisma.customerServiceTuningAnalysis.findFirst({
      where: { id, session: { tenantId } },
      select: {
        id: true,
        sessionId: true,
        understanding: true,
        runtimeContract: true,
        generation: true,
        quality: true,
        summary: true,
        configurationHash: true,
        contentHash: true,
        session: {
          select: {
            merchantRoleId: true,
            industryNodeId: true,
            accountProfileId: true,
            purpose: true,
            contextSnapshot: true,
          },
        },
      },
    });
  }

  findByContentHash(tenantId: string, contentHash: string) {
    return this.prisma.customerServiceCalibrationRecord.findFirst({
      where: { tenantId, contentHash, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: recordInclude,
    });
  }

  create(data: Prisma.CustomerServiceCalibrationRecordUncheckedCreateInput) {
    return this.prisma.customerServiceCalibrationRecord.create({ data, include: recordInclude });
  }

  updateStatus(id: string, tenantId: string, revision: number, status: string, userId: string) {
    return this.prisma.customerServiceCalibrationRecord.updateMany({
      where: { id, tenantId, deletedAt: null, revision },
      data: { status, revision: { increment: 1 }, updatedById: userId },
    });
  }

  updateAnalysis(
    id: string,
    tenantId: string,
    revision: number,
    data: Prisma.CustomerServiceCalibrationRecordUncheckedUpdateManyInput,
  ) {
    return this.prisma.customerServiceCalibrationRecord.updateMany({
      where: { id, tenantId, deletedAt: null, revision },
      data,
    });
  }

  tryStartAnalysis(id: string, tenantId: string, revision: number, userId: string, staleBefore: Date) {
    return (this.prisma.customerServiceCalibrationRecord as any).updateMany({
      where: {
        id,
        tenantId,
        deletedAt: null,
        revision,
        OR: [
          { aiAnalysisStatus: { not: 'PROCESSING' } },
          { aiAnalysisStatus: null },
          { aiAnalysisStartedAt: { lt: staleBefore } },
        ],
      },
      data: {
        aiAnalysisStatus: 'PROCESSING',
        aiAnalysisStartedAt: new Date(),
        aiAnalysisAttempts: { increment: 1 },
        aiAnalysisDiagnostics: Prisma.JsonNull,
        updatedById: userId,
        revision: { increment: 1 },
      },
    });
  }

  updateApplied(
    id: string,
    tenantId: string,
    revision: number,
    data: Prisma.CustomerServiceCalibrationRecordUncheckedUpdateManyInput,
  ) {
    return this.prisma.customerServiceCalibrationRecord.updateMany({
      where: { id, tenantId, deletedAt: null, revision },
      data,
    });
  }

  updateStrategyDraft(
    id: string,
    tenantId: string,
    revision: number,
    data: Record<string, unknown>,
  ) {
    return this.prisma.customerServiceCalibrationRecord.updateMany({
      where: { id, tenantId, deletedAt: null, revision },
      data: data as Prisma.CustomerServiceCalibrationRecordUncheckedUpdateManyInput,
    });
  }
}
