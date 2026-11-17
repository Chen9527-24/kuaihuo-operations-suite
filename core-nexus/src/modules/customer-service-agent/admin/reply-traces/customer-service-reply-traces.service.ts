import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId } from '../../../../common/utils/tenant-scope';
import { PrismaService } from '../../../../prisma/prisma.service';
import { boundJsonPayload, jsonBytes } from '../../shared/utils/bounded-json-payload.util';
import { stableJsonHash } from '../../shared/utils/stable-json-hash.util';
import type { ExecuteCustomerServiceSimulationDto } from '../../runtime/simulation/dto/execute-simulation.dto';
import type { CustomerServiceSimulationExecutionResult } from '../../runtime/compiler/types/runtime-reply-contract.type';
import { UpsertCustomerServiceReplyFeedbackDto } from './dto/upsert-reply-feedback.dto';
import {
  resolveCustomerServiceIntentFlowPreferences,
  resolveCustomerServiceReplyExperiencePreferences,
  resolveCustomerServiceConversationStrategyPreferences,
} from '../../shared/context/customer-service-account-runtime-preferences.util';

export const CUSTOMER_SERVICE_REPLY_TRACE_SOURCE_TYPES = [
  'ROBOT_TEST_DM',
  'ROBOT_TEST_COMMENT',
  'RUNTIME_DM',
  'RUNTIME_COMMENT',
  'TUNING_SIMULATION',
  'RUNTIME_API',
  'INTERCEPT_WORK_DECISION',
  'INTERCEPT_INTENT_DRAFT',
] as const;
export type CustomerServiceReplyTraceSourceType = (typeof CUSTOMER_SERVICE_REPLY_TRACE_SOURCE_TYPES)[number];

export type CustomerServiceReplyTraceContext = {
  sourceType: CustomerServiceReplyTraceSourceType;
  sourceRefId?: string;
  robotId?: string;
  channel?: 'DM' | 'COMMENT' | string;
  platform?: string;
  conversationId?: string;
  commentThreadId?: string;
  customerMessageId?: string;
  replyMessageId?: string;
  replyAttemptId?: string;
  postContext?: string;
  conversationSnapshot?: unknown;
  canonicalConversationState?: {
    previousRevision: number | null;
    previousStateHash: string | null;
    projectionStatus: string;
    revision: number | null;
    stateHash: string | null;
    evidenceMessageId: string | null;
    rebuildRequired: boolean;
    currentCustomerApplied?: boolean;
    stateRevisionAtGeneration?: number | null;
    stateHashAtGeneration?: string | null;
  };
};

type RuntimeTraceInput = {
  tenantId: string;
  createdById?: string;
  runtimeRequestId?: string;
  dto: ExecuteCustomerServiceSimulationDto;
  context: CustomerServiceReplyTraceContext;
  result: CustomerServiceSimulationExecutionResult & Record<string, unknown>;
  segments: Array<{ index: number; content: string; delayBeforeMs: number }>;
  qualityStatus: string;
  safetyStatus: string;
  fallbackUsed: boolean;
};

type DecisionTraceInput = {
  tenantId: string;
  createdById?: string;
  context: CustomerServiceReplyTraceContext;
  customerMessage: string;
  accountProfileId?: string;
  storeProfileId?: string;
  merchantRoleId?: string;
  industryNodeId?: string;
  action: 'SEND' | 'SKIP' | 'HANDOFF';
  decision: Record<string, unknown>;
  model?: string;
  configurationHash?: string;
  sourceRevisions?: unknown;
  provider?: string;
  generationSource?: string;
  fallbackUsed?: boolean;
  knowledgeEntryIds?: string[];
  languagePolicyIds?: string[];
};

@Injectable()
export class CustomerServiceReplyTracesService {
  constructor(private readonly prisma: PrismaService) {}

  async createRuntimeTrace(input: RuntimeTraceInput) {
    const contract = input.result.contract;
    const generation = input.result.generation;
    const quality = input.result.quality;
    const conversationSnapshot = boundJsonPayload(input.context.conversationSnapshot ?? {
      history: input.dto.conversationHistory || [],
      state: input.dto.conversationState || null,
      variables: input.dto.variables || {},
      facts: input.dto.facts || [],
    }, 96 * 1024);
    const contractSnapshot = boundJsonPayload(contract, 192 * 1024);
    const generationSnapshot = boundJsonPayload({
      status: generation.status,
      source: generation.source,
      finalReplySource: generation.finalReplySource,
      requestedModel: generation.requestedModel,
      actualModel: generation.actualModel,
      model: generation.model,
      requestId: generation.requestId,
      fallbackUsed: generation.fallbackUsed,
      fallbackReason: generation.fallbackReason,
      deliveryDecision: generation.deliveryDecision,
      modelAttempts: generation.modelAttempts,
      outputRuleApplications: generation.outputRuleApplications || [],
      hve3: generation.hve3 || null,
      finalTextFreeze: generation.finalTextFreeze || null,
      executionLane: contract.orchestrationPlan.interactionExecution?.lane || 'HVE_ACTIVE',
      promptKernel: (generation.hve3 as Record<string, unknown> | undefined)?.kernel || null,
      performance: input.result.performance,
      canonicalConversationState: input.context.canonicalConversationState || null,
    }, 96 * 1024);
    const qualitySnapshot = boundJsonPayload(quality, 64 * 1024);
    const understandingSnapshot = boundJsonPayload({
      summary: input.result.summary,
      classification: contract.classification,
    }, 48 * 1024);
    const finalReply = input.segments.map((item) => item.content.trim()).filter(Boolean).join('\n');
    const strategySources = contract.strategyPolicy.sources || [];
    const languagePolicies = contract.businessContext.languagePolicies || [];
    const knowledgeEntries = contract.businessContext.knowledgeEntries || [];
    const contentHash = stableJsonHash({
      sourceType: input.context.sourceType,
      sourceRefId: input.context.sourceRefId || null,
      runtimeRequestId: input.runtimeRequestId || null,
      customerMessage: input.dto.message,
      finalReply,
      configurationHash: contract.provenance.configurationHash,
      generationSource: generation.finalReplySource,
    });
    const payloadBytes = jsonBytes({
      conversationSnapshot: conversationSnapshot.value,
      runtimeContract: contractSnapshot.value,
      generationDetails: generationSnapshot.value,
      qualityReport: qualitySnapshot.value,
      understandingSummary: understandingSnapshot.value,
      replySegments: input.segments,
    });
    const data = {
        tenantId: input.tenantId,
        runtimeRequestId: input.runtimeRequestId,
        sourceType: input.context.sourceType,
        sourceRefId: cleanLimited(input.context.sourceRefId, 512),
        robotId: clean(input.context.robotId),
        accountProfileId: clean(contract.businessContext.accountProfile?.id || input.dto.accountProfileId),
        storeProfileId: clean(contract.businessContext.storeProfile?.id || input.dto.storeProfileId),
        merchantRoleId: clean(contract.identity.merchantRole.id || input.dto.merchantRoleId),
        industryNodeId: clean(contract.classification.industry?.id || input.dto.industryNodeId),
        channel: cleanLimited(input.context.channel || readString(input.dto.variables, 'channel'), 32),
        platform: cleanLimited(input.context.platform || readString(input.dto.variables, 'platform'), 64),
        conversationId: cleanLimited(input.context.conversationId, 512),
        commentThreadId: cleanLimited(input.context.commentThreadId, 512),
        customerMessageId: cleanLimited(input.context.customerMessageId, 512),
        replyMessageId: cleanLimited(input.context.replyMessageId, 512),
        replyAttemptId: cleanLimited(input.context.replyAttemptId, 512),
        customerMessage: input.dto.message.trim(),
        replySegments: input.segments as unknown as Prisma.InputJsonValue,
        finalReply,
        conversationSnapshot: conversationSnapshot.value as Prisma.InputJsonValue,
        runtimeContract: contractSnapshot.value as Prisma.InputJsonValue,
        generationDetails: generationSnapshot.value as Prisma.InputJsonValue,
        postContext: cleanLimited(input.context.postContext || readString(input.dto.variables, 'postContext'), 20_000),
        provider: generation.model || generation.requestedModel ? 'DEEPSEEK' : 'SYSTEM',
        model: cleanLimited(generation.actualModel || generation.model || generation.requestedModel, 120),
        generationSource: generation.finalReplySource,
        configurationHash: cleanLimited(contract.provenance.configurationHash, 64),
        sourceRevisions: contract.provenance.sourceRevisions as unknown as Prisma.InputJsonValue,
        strategyAssetIds: uniqueStrings(strategySources.map((item) => item.assetId)),
        strategyVersionIds: uniqueStrings(strategySources.map((item) => item.versionId)),
        languagePolicyIds: uniqueStrings(languagePolicies.map((item) => item.id)),
        knowledgeEntryIds: uniqueStrings(knowledgeEntries.map((item) => item.id)),
        understandingSummary: understandingSnapshot.value as Prisma.InputJsonValue,
        qualityStatus: input.qualityStatus,
        safetyStatus: input.safetyStatus,
        qualityReport: qualitySnapshot.value as Prisma.InputJsonValue,
        fallbackUsed: input.fallbackUsed,
        contentHash,
        payloadBytes,
        createdById: input.createdById || null,
    };
    if (input.runtimeRequestId) {
      return (this.prisma as any).customerServiceReplyTrace.upsert({
        where: { tenantId_runtimeRequestId: { tenantId: input.tenantId, runtimeRequestId: input.runtimeRequestId } },
        create: data,
        update: data,
        select: { id: true, sourceType: true, sourceRefId: true, configurationHash: true, createdAt: true },
      });
    }
    return (this.prisma as any).customerServiceReplyTrace.create({
      data,
      select: { id: true, sourceType: true, sourceRefId: true, configurationHash: true, createdAt: true },
    });
  }

  async createExternalTrace(input: {
    tenantId: string;
    createdById?: string;
    context: CustomerServiceReplyTraceContext;
    customerMessage: string;
    replySegments: Array<{ index: number; content: string; delayBeforeMs: number }>;
    provider: string;
    model?: string;
    generationSource: string;
    accountProfileId?: string;
    storeProfileId?: string;
    merchantRoleId?: string;
    industryNodeId?: string;
    qualityStatus?: string;
    safetyStatus?: string;
    fallbackUsed?: boolean;
    details?: unknown;
    configurationHash?: string;
    sourceRevisions?: unknown;
    strategyAssetIds?: string[];
    strategyVersionIds?: string[];
    languagePolicyIds?: string[];
    knowledgeEntryIds?: string[];
    qualityReport?: unknown;
  }) {
    let accountProfileId = clean(input.accountProfileId);
    let storeProfileId = clean(input.storeProfileId);
    let merchantRoleId = clean(input.merchantRoleId);
    let industryNodeId = clean(input.industryNodeId);
    if (accountProfileId && (!storeProfileId || !merchantRoleId || !industryNodeId)) {
      const accountProfile = await (this.prisma as any).customerServiceAccountProfile.findFirst({
        where: { id: accountProfileId, tenantId: input.tenantId, deletedAt: null },
        select: { id: true, storeProfileId: true, merchantRoleId: true, industryNodeId: true },
      });
      if (accountProfile) {
        accountProfileId = accountProfile.id;
        storeProfileId ||= clean(accountProfile.storeProfileId);
        merchantRoleId ||= clean(accountProfile.merchantRoleId);
        industryNodeId ||= clean(accountProfile.industryNodeId);
      }
    }
    const details = boundJsonPayload(input.details ?? {}, 64 * 1024);
    const sourceRevisions = input.sourceRevisions ? boundJsonPayload(input.sourceRevisions, 64 * 1024) : null;
    const qualityReport = input.qualityReport ? boundJsonPayload(input.qualityReport, 64 * 1024) : null;
    const finalReply = input.replySegments.map((item) => item.content.trim()).filter(Boolean).join('\n');
    const contentHash = stableJsonHash({
      sourceType: input.context.sourceType,
      sourceRefId: input.context.sourceRefId || null,
      customerMessage: input.customerMessage,
      finalReply,
      provider: input.provider,
      generationSource: cleanLimited(input.generationSource, 64) || 'UNKNOWN',
    });
    return (this.prisma as any).customerServiceReplyTrace.create({
      data: {
        tenantId: input.tenantId,
        sourceType: input.context.sourceType,
        sourceRefId: cleanLimited(input.context.sourceRefId, 512),
        robotId: clean(input.context.robotId),
        accountProfileId,
        storeProfileId,
        merchantRoleId,
        industryNodeId,
        channel: cleanLimited(input.context.channel, 32),
        platform: cleanLimited(input.context.platform, 64),
        conversationId: cleanLimited(input.context.conversationId, 512),
        commentThreadId: cleanLimited(input.context.commentThreadId, 512),
        customerMessageId: cleanLimited(input.context.customerMessageId, 512),
        replyMessageId: cleanLimited(input.context.replyMessageId, 512),
        replyAttemptId: cleanLimited(input.context.replyAttemptId, 512),
        customerMessage: input.customerMessage.trim(),
        replySegments: input.replySegments as unknown as Prisma.InputJsonValue,
        finalReply,
        conversationSnapshot: Prisma.JsonNull,
        runtimeContract: Prisma.JsonNull,
        generationDetails: details.value as Prisma.InputJsonValue,
        postContext: cleanLimited(input.context.postContext, 20_000),
        provider: cleanLimited(input.provider, 40),
        model: cleanLimited(input.model, 120),
        generationSource: cleanLimited(input.generationSource, 64) || 'UNKNOWN',
        configurationHash: cleanLimited(input.configurationHash, 64),
        sourceRevisions: sourceRevisions ? sourceRevisions.value as Prisma.InputJsonValue : Prisma.JsonNull,
        strategyAssetIds: uniqueStrings(input.strategyAssetIds || []),
        strategyVersionIds: uniqueStrings(input.strategyVersionIds || []),
        languagePolicyIds: uniqueStrings(input.languagePolicyIds || []),
        knowledgeEntryIds: uniqueStrings(input.knowledgeEntryIds || []),
        understandingSummary: Prisma.JsonNull,
        qualityStatus: cleanLimited(input.qualityStatus, 32) || 'NOT_RUN',
        safetyStatus: cleanLimited(input.safetyStatus, 32) || 'NOT_RUN',
        qualityReport: qualityReport ? qualityReport.value as Prisma.InputJsonValue : Prisma.JsonNull,
        fallbackUsed: Boolean(input.fallbackUsed),
        contentHash,
        payloadBytes: details.storedBytes + (sourceRevisions?.storedBytes || 0) + (qualityReport?.storedBytes || 0) + jsonBytes(input.replySegments),
        createdById: input.createdById || null,
      },
      select: { id: true, sourceType: true, sourceRefId: true, createdAt: true },
    });
  }

  async createDecisionTrace(input: DecisionTraceInput) {
    const snapshot = boundJsonPayload(input.decision, 32 * 1024);
    const sourceRevisions = input.sourceRevisions
      ? boundJsonPayload(input.sourceRevisions, 32 * 1024)
      : null;
    const contentHash = stableJsonHash({
      sourceType: input.context.sourceType,
      sourceRefId: input.context.sourceRefId || null,
      customerMessage: input.customerMessage,
      action: input.action,
      decision: snapshot.value,
    });
    return (this.prisma as any).customerServiceReplyTrace.create({
      data: {
        tenantId: input.tenantId,
        sourceType: input.context.sourceType,
        sourceRefId: cleanLimited(input.context.sourceRefId, 512),
        robotId: clean(input.context.robotId),
        accountProfileId: clean(input.accountProfileId),
        storeProfileId: clean(input.storeProfileId),
        merchantRoleId: clean(input.merchantRoleId),
        industryNodeId: clean(input.industryNodeId),
        channel: cleanLimited(input.context.channel, 32),
        platform: cleanLimited(input.context.platform, 64),
        conversationId: cleanLimited(input.context.conversationId, 512),
        commentThreadId: cleanLimited(input.context.commentThreadId, 512),
        customerMessageId: cleanLimited(input.context.customerMessageId, 512),
        replyMessageId: cleanLimited(input.context.replyMessageId, 512),
        replyAttemptId: cleanLimited(input.context.replyAttemptId, 512),
        customerMessage: input.customerMessage.trim(),
        replySegments: [] as unknown as Prisma.InputJsonValue,
        finalReply: '',
        conversationSnapshot: snapshot.value as Prisma.InputJsonValue,
        runtimeContract: Prisma.JsonNull,
        generationDetails: snapshot.value as Prisma.InputJsonValue,
        postContext: cleanLimited(input.context.postContext, 20_000),
        provider: cleanLimited(input.provider, 40) || 'DEEPSEEK',
        model: cleanLimited(input.model, 120),
        generationSource: cleanLimited(input.generationSource, 64)
          || (input.action === 'HANDOFF' ? 'HUMAN_HANDOFF' : input.action === 'SEND' ? 'DECISION_ALLOW' : 'ADMISSION_SKIP'),
        configurationHash: cleanLimited(input.configurationHash, 64),
        sourceRevisions: sourceRevisions
          ? sourceRevisions.value as Prisma.InputJsonValue
          : Prisma.JsonNull,
        languagePolicyIds: uniqueStrings(input.languagePolicyIds || []),
        knowledgeEntryIds: uniqueStrings(input.knowledgeEntryIds || []),
        understandingSummary: snapshot.value as Prisma.InputJsonValue,
        qualityStatus: 'NOT_RUN',
        safetyStatus: input.action === 'HANDOFF' ? 'BLOCKED' : 'NOT_RUN',
        qualityReport: Prisma.JsonNull,
        fallbackUsed: Boolean(input.fallbackUsed),
        contentHash,
        payloadBytes: snapshot.storedBytes + (sourceRevisions?.storedBytes || 0),
        createdById: input.createdById || null,
      },
      select: { id: true, sourceType: true, sourceRefId: true, createdAt: true },
    });
  }

  async getScopedInternal(id: string, tenantId: string) {
    const trace = await (this.prisma as any).customerServiceReplyTrace.findFirst({
      where: { id, tenantId, payloadState: { not: 'PURGED' } },
    });
    if (!trace) throw new NotFoundException('回复追踪不存在、已清理或不属于当前租户');
    return trace;
  }

  async getSafeDetail(id: string, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const trace = await (this.prisma as any).customerServiceReplyTrace.findFirst({
      where: { id, tenantId, payloadState: { not: 'PURGED' } },
      select: {
        id: true,
        sourceType: true,
        sourceRefId: true,
        robotId: true,
        accountProfileId: true,
        storeProfileId: true,
        merchantRoleId: true,
        industryNodeId: true,
        channel: true,
        platform: true,
        conversationId: true,
        commentThreadId: true,
        customerMessageId: true,
        replyMessageId: true,
        replyAttemptId: true,
        provider: true,
        model: true,
        generationSource: true,
        configurationHash: true,
        sourceRevisions: true,
        strategyAssetIds: true,
        strategyVersionIds: true,
        languagePolicyIds: true,
        knowledgeEntryIds: true,
        understandingSummary: true,
        qualityStatus: true,
        safetyStatus: true,
        qualityReport: true,
        runtimeContract: true,
        generationDetails: true,
        fallbackUsed: true,
        payloadState: true,
        createdAt: true,
        feedbacks: {
          where: { createdById: user.id },
          select: { id: true, feedback: true, note: true, updatedAt: true },
          take: 1,
        },
        calibrationRecords: {
          where: { tenantId, deletedAt: null },
          select: { id: true, status: true, strategyDraftStatus: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!trace) throw new NotFoundException('回复追踪不存在、已清理或不属于当前租户');
    const scopeImpact = await this.resolveScopeImpact({
      tenantId,
      merchantRoleId: trace.merchantRoleId,
      accountProfileId: trace.accountProfileId,
    });
    const runtimeExplainability = this.buildRuntimeExplainability(
      trace.runtimeContract,
      trace.generationDetails,
      trace.fallbackUsed,
    );
    return {
      ...trace,
      runtimeExplainability,
      runtimeContract: undefined,
      generationDetails: undefined,
      scopeImpact,
      feedback: trace.feedbacks?.[0] || null,
      calibration: trace.calibrationRecords?.[0] || null,
      feedbacks: undefined,
      calibrationRecords: undefined,
    };
  }

  private buildRuntimeExplainability(runtimeContract: unknown, generationDetails: unknown, fallbackUsed: boolean) {
    const contract = asRecord(runtimeContract);
    const businessContext = asRecord(contract.businessContext);
    const storeProfile = asRecord(businessContext.storeProfile);
    const accountProfile = asRecord(businessContext.accountProfile);
    const intentPreferences = resolveCustomerServiceIntentFlowPreferences({ storeProfile, accountProfile });
    const replyExperience = resolveCustomerServiceReplyExperiencePreferences({ storeProfile, accountProfile });
    const conversationStrategy = resolveCustomerServiceConversationStrategyPreferences({ storeProfile, accountProfile });
    const classification = asRecord(contract.classification);
    const intentGuidance = Array.isArray(contract.intentGuidance)
      ? contract.intentGuidance.map(asRecord).filter((item) => Object.keys(item).length)
      : [];
    const matchedIntent = intentGuidance[0] || {};
    const strategyPolicy = asRecord(contract.strategyPolicy);
    const resolved = asRecord(strategyPolicy.resolved);
    const structure = asRecord(resolved.structure);
    const delivery = asRecord(resolved.delivery);
    const generation = asRecord(generationDetails);
    const generationContext = asRecord(contract.generationContext);
    const activeContextWindow = asRecord(generationContext.contextWindow);
    const conversationState = asRecord(generationContext.conversationState);
    const orchestrationPlan = asRecord(contract.orchestrationPlan);
    const humanBehavior = asRecord(orchestrationPlan.expressionPlan);
    const interactionPlanV2 = asRecord(orchestrationPlan.interactionPlanV2);
    const interactionPlanV2Legacy = asRecord(orchestrationPlan.interactionPlanV2Legacy);
    const guidelineResolutionSet = asRecord(orchestrationPlan.guidelineResolutionSet);
    const interactionPlanV2Comparison = asRecord(orchestrationPlan.interactionPlanV2Comparison);
    const behaviorHistory = asRecord(conversationState.behaviorHistory);
    const runtimeInputBudget = asRecord(businessContext.runtimeInputBudget);
    const behaviorDecisionReasons = Array.isArray(humanBehavior.decisionReasons)
      ? humanBehavior.decisionReasons.map(asRecord).map((item) => ({
          ruleId: cleanLimited(item.ruleId, 120),
          priority: Number(item.priority || 0),
          reason: cleanLimited(item.reason, 320),
        })).filter((item) => item.ruleId || item.reason).slice(0, 80)
      : [];
    return {
      intent: {
        key: clean(matchedIntent.key) || clean(classification.intent),
        name: clean(matchedIntent.name),
        scenario: clean(classification.scenario),
        scopeSource: intentPreferences.source,
        scopeMode: intentPreferences.mode,
        configuredKeys: intentPreferences.keys,
      },
      replyExperience: {
        source: replyExperience.source,
        preset: replyExperience.preset,
        maxSentences: Number(structure.maxSentences ?? replyExperience.policy.structure.maxSentences),
        delivery: {
          mode: clean(delivery.mode) || replyExperience.policy.delivery.mode,
          maxSegments: Number(delivery.maxSegments ?? replyExperience.policy.delivery.maxSegments),
          splitThresholdChars: Number(delivery.splitThresholdChars ?? replyExperience.policy.delivery.splitThresholdChars),
          minDelayMs: Number(delivery.minDelayMs ?? replyExperience.policy.delivery.minDelayMs),
          maxDelayMs: Number(delivery.maxDelayMs ?? replyExperience.policy.delivery.maxDelayMs),
          cancelRemainingOnCustomerMessage: delivery.cancelRemainingOnCustomerMessage !== false,
        },
      },
      conversationStrategy,
      conversationState,
      planner: {
        route: clean(orchestrationPlan.route),
        serviceGoal: clean(orchestrationPlan.serviceGoal),
        humanityGoal: clean(orchestrationPlan.humanityGoal),
        businessGoal: clean(orchestrationPlan.businessGoal),
        salesVisibility: clean(orchestrationPlan.salesVisibility),
        questionBudget: Number(orchestrationPlan.questionBudget || 0),
        informationBudget: Number(orchestrationPlan.informationBudget || 0),
        microActions: Array.isArray(orchestrationPlan.microActions) ? orchestrationPlan.microActions : [],
        prohibitedMicroActions: Array.isArray(orchestrationPlan.prohibitedMicroActions) ? orchestrationPlan.prohibitedMicroActions : [],
        stateGuidance: asRecord(orchestrationPlan.stateGuidance),
        identityConstraint: asRecord(orchestrationPlan.identityConstraint),
      },
      humanBehavior,
      interactionPlanV2: Object.keys(interactionPlanV2).length ? interactionPlanV2 : null,
      hve3Execution: {
        envelope: asRecord(orchestrationPlan.interactionExecution),
        diagnostics: asRecord(generation.hve3),
        finalTextFreeze: asRecord(generation.finalTextFreeze),
      },
      guidelinePolicy: Object.keys(guidelineResolutionSet).length ? {
        resolutionSet: guidelineResolutionSet,
        legacyPlan: Object.keys(interactionPlanV2Legacy).length ? interactionPlanV2Legacy : null,
        comparison: Object.keys(interactionPlanV2Comparison).length ? interactionPlanV2Comparison : null,
      } : null,
      behaviorExplainability: {
        preferenceSource: conversationStrategy.source,
        preferencePolicy: conversationStrategy.policy.humanBehavior,
        matchedBehaviorRules: readStringArray(humanBehavior.matchedRuleIds).slice(0, 80),
        suppressedBehaviorRules: readStringArray(humanBehavior.suppressedRuleIds).slice(0, 80),
        decisionReasons: behaviorDecisionReasons,
        expressionPlan: humanBehavior,
        behaviorHistory,
      },
      inputBudget: runtimeInputBudget,
      canonicalConversationState: asRecord(generation.canonicalConversationState),
      activeContext: activeContextWindow.budgetApplied === true ? activeContextWindow : {},
      legacyPrompt: {
        normalDeepSeekUsesLegacyPrompt: false,
        fallbackUsed: Boolean(fallbackUsed),
        fallbackReason: clean(generation.fallbackReason),
      },
    };
  }

  private async resolveScopeImpact(input: { tenantId: string; merchantRoleId?: string | null; accountProfileId?: string | null }) {
    if (!input.merchantRoleId) {
      return {
        accountScope: { accountCount: input.accountProfileId ? 1 : 0, robotCount: 0 },
        roleScope: { accountCount: 0, robotCount: 0 },
      };
    }
    const accounts = await (this.prisma as any).customerServiceAccountProfile.findMany({
      where: {
        tenantId: input.tenantId,
        merchantRoleId: input.merchantRoleId,
        deletedAt: null,
        status: 'ENABLED',
      },
      select: { id: true },
    });
    const accountIds = new Set(accounts.map((item: any) => String(item.id)));
    const settings = await (this.prisma as any).autoReplyRobotSetting.findMany({
      where: { tenantId: input.tenantId },
      select: { robotId: true, config: true },
    });
    const roleRobotIds = new Set<string>();
    const accountRobotIds = new Set<string>();
    for (const setting of settings) {
      const config = asRecord(setting.config);
      const binding = asRecord(config.aiBinding);
      const accountProfileId = clean(binding.accountProfileId);
      if (!accountProfileId) continue;
      const robotId = clean(setting.robotId);
      if (!robotId) continue;
      if (accountIds.has(accountProfileId)) roleRobotIds.add(robotId);
      if (input.accountProfileId && accountProfileId === input.accountProfileId) accountRobotIds.add(robotId);
    }
    return {
      accountScope: { accountCount: input.accountProfileId ? 1 : 0, robotCount: accountRobotIds.size },
      roleScope: { accountCount: accountIds.size, robotCount: roleRobotIds.size },
    };
  }

  async upsertFeedback(id: string, dto: UpsertCustomerServiceReplyFeedbackDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const exists = await (this.prisma as any).customerServiceReplyTrace.findFirst({
      where: { id, tenantId, payloadState: { not: 'PURGED' } },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('回复追踪不存在、已清理或不属于当前租户');
    return (this.prisma as any).customerServiceReplyFeedback.upsert({
      where: {
        tenantId_replyTraceId_createdById: { tenantId, replyTraceId: id, createdById: user.id },
      },
      create: {
        tenantId,
        replyTraceId: id,
        feedback: dto.feedback,
        note: clean(dto.note),
        createdById: user.id,
      },
      update: {
        feedback: dto.feedback,
        note: clean(dto.note),
      },
      select: { id: true, replyTraceId: true, feedback: true, note: true, createdAt: true, updatedAt: true },
    });
  }
}

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanLimited(value: unknown, maxLength: number) {
  const normalized = clean(value);
  return normalized ? normalized.slice(0, maxLength) : null;
}

function readString(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = (value as Record<string, unknown>)[key];
  return typeof item === 'string' ? item : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}
