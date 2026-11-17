import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId, resolveTenantId } from '../../../../common/utils/tenant-scope';
import { CustomerServiceCalibrationProfileRepository } from '../../infrastructure/persistence/customer-service-calibration-profile.repository';
import { CustomerServiceIntentCandidateRepository } from '../../infrastructure/persistence/customer-service-intent-candidate.repository';
import { CustomerServiceIntentDefinitionRepository } from '../../infrastructure/persistence/customer-service-intent-definition.repository';
import { CustomerServiceRuntimeSourceRepository } from '../../infrastructure/persistence/customer-service-runtime-source.repository';
import { CustomerServiceGuidelineRepository } from '../../infrastructure/persistence/customer-service-guideline.repository';
import { normalizeCustomerServicePublishedGuidelines } from '../guideline/customer-service-guideline-runtime.util';
import { CustomerServiceTuningSessionRepository } from '../../infrastructure/persistence/customer-service-tuning-session.repository';
import { CustomerServiceContextProfileRepository } from '../../infrastructure/persistence/customer-service-context-profile.repository';
import { boundJsonPayload } from '../../shared/utils/bounded-json-payload.util';
import { stableJsonHash } from '../../shared/utils/stable-json-hash.util';
import { CustomerServiceRuntimeContractCompiler } from '../compiler/customer-service-runtime-contract-compiler.service';
import { CustomerServiceSimulationExecutionResult } from '../compiler/types/runtime-reply-contract.type';
import type { CustomerServiceCanonicalTranscriptV1 } from '../interaction/customer-service-summary-source.contract';
import { buildCustomerServiceServerCanonicalTranscript } from '../interaction/customer-service-summary-source.contract';
import { CustomerServiceReplyTracesService } from '../../admin/reply-traces/customer-service-reply-traces.service';
import { CustomerServiceKnowledgeEntriesService } from '../../admin/knowledge-entries/customer-service-knowledge-entries.service';
import { CustomerServiceHve3ExecutionService } from '../generation/customer-service-hve3-execution.service';
import { finalizeCustomerServiceDelivery } from '../generation/customer-service-final-delivery-arbiter';
import { CustomerServiceDeepRecognitionService } from '../understanding/customer-service-deep-recognition.service';
import { CustomerServiceMessageUnderstandingService } from '../understanding/customer-service-message-understanding.service';
import { CustomerServiceMessageUnderstanding } from '../understanding/types/customer-service-message-understanding.type';
import { finalizeCustomerServiceFactOwnershipFromGroundingEvidence } from '../understanding/customer-service-explicit-semantics';
import {
  customerServiceLongHorizonStateEnabled,
  readCustomerServiceConversationStateV2,
  reduceCustomerServiceConversationState,
  summarizeCustomerServiceConversationState,
  projectCustomerServiceActiveContextBudgetState,
} from '../state/customer-service-conversation-state.reducer';
import { CompileCustomerServiceSimulationDto } from './dto/compile-simulation.dto';
import { ExecuteCustomerServiceSimulationDto } from './dto/execute-simulation.dto';
import {
  filterCustomerServiceIntentItems,
  resolveCustomerServiceIntentFlowPreferences,
  resolveCustomerServiceConversationStrategyPreferences,
} from '../../shared/context/customer-service-account-runtime-preferences.util';
import { selectEffectiveLanguagePolicies } from '../../shared/context/customer-service-language-policy.util';
import {
  finalizeCustomerServiceRuntimeInputBudget,
  planCustomerServiceRuntimeInputBudget,
} from '../../shared/context/customer-service-runtime-input-budget.util';
import type { CustomerServiceConversationStateSummary } from '../state/customer-service-conversation-state.type';
import {
  extractCustomerServiceBehaviorPlanFromRuntimeContract,
  extractCustomerServiceInteractionPlanV2FromRuntimeContract,
  extractCustomerServiceProvenGroundingRefsFromReplyTrace,
  extractCustomerServiceProvenGroundedUnitsFromReplyTrace,
  resolveCustomerServicePlanFulfillmentFromReplyTrace,
  resolveCustomerServiceProvenEvidenceRecall,
} from '../behavior/customer-service-behavior-memory.util';
import { inspectCustomerServiceHveV19Activation } from '../activation/customer-service-hve-v19-activation';
import {
  DIALOGUE_ACTIVE_CONTEXT_DEFAULT_TOKEN_BUDGET,
  DIALOGUE_ACTIVE_CONTEXT_RECENT_TOKEN_RATIO,
  coalesceDialogueActiveContextRows,
  estimateDialogueContextJsonTokens,
  estimateDialogueContextTextTokens,
  extractConversationStateEvidenceMessageIds,
  selectDialogueActiveContextRows,
  uniqueDialogueRowsById,
} from '../../../dialogue-records/dialogue-active-context.util';
import {
  resolveCustomerServiceEffectiveBusinessScope,
  type CustomerServiceEffectiveBusinessScopeV1,
} from '../../shared/context/customer-service-business-scope.util';

export type CustomerServiceSimulationExecutionOptions = {
  sessionPurpose?: 'TUNING' | 'ROBOT_TEST_DM';
};

@Injectable()
export class CustomerServiceSimulationService {
  private readonly logger = new Logger(CustomerServiceSimulationService.name);

  constructor(
    private readonly repository: CustomerServiceRuntimeSourceRepository,
    private readonly guidelineRepository: CustomerServiceGuidelineRepository,
    private readonly intentDefinitionRepository: CustomerServiceIntentDefinitionRepository,
    private readonly intentCandidateRepository: CustomerServiceIntentCandidateRepository,
    private readonly tuningSessionRepository: CustomerServiceTuningSessionRepository,
    private readonly calibrationProfileRepository: CustomerServiceCalibrationProfileRepository,
    private readonly contextProfileRepository: CustomerServiceContextProfileRepository,
    private readonly knowledgeEntriesService: CustomerServiceKnowledgeEntriesService,
    private readonly understandingService: CustomerServiceMessageUnderstandingService,
    private readonly deepRecognitionService: CustomerServiceDeepRecognitionService,
    private readonly compiler: CustomerServiceRuntimeContractCompiler,
    private readonly hve3Execution: CustomerServiceHve3ExecutionService,
    private readonly replyTraces: CustomerServiceReplyTracesService,
  ) {}

  async compile(dto: CompileCustomerServiceSimulationDto, user: CurrentUserPayload) {
    const prepared = await this.prepareDto(dto, user);
    const identity = await this.loadIdentity(prepared.dto, user);
    this.assertPreparedSessionBusinessScope(prepared.sessionScopeFingerprint, identity.businessScope);
    const fixedQaMatch = await this.resolveFixedQa(prepared.dto, identity);
    const heuristic = this.understandingService.understand(prepared.dto);
    let understanding = heuristic;
    if (!fixedQaMatch) {
      const recognitionCatalog = filterCustomerServiceIntentItems(
        await this.intentDefinitionRepository.findRecognitionCatalog(
          identity.role.tenantId,
          identity.industry?.code || null,
        ),
        resolveCustomerServiceIntentFlowPreferences(identity),
      );
      understanding = await this.deepRecognitionService.refine(prepared.dto, heuristic, recognitionCatalog);
      understanding = await this.collectRecognizedIntents(prepared.dto, understanding, identity);
    }
    const conversationState = summarizeCustomerServiceConversationState(
      readCustomerServiceConversationStateV2(prepared.dto.conversationState),
      prepared.dto.message,
    );
    const sources = await this.loadSources(prepared.dto, understanding, identity, conversationState, fixedQaMatch);
    understanding = {
      ...understanding,
      factOwnership: finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
        ownership: understanding.factOwnership,
        primaryScenario: understanding.primaryScenario,
        primaryIntent: understanding.primaryIntent,
        message: prepared.dto.message,
        namedOfferingMentionSpans: understanding.namedOfferingMentionSpans,
        priorDeliveredGroundingRefs: readLatestDeliveredGroundingRefs(prepared.dto.conversationState),
        contextualReferentSelection: understanding.contextualReferentSelection,
        knowledgeEntries: sources.businessContext.knowledgeEntries,
      }),
    };
    const compiled = this.compiler.compile(
      sources.role,
      sources.industry,
      sources.businessContext,
      sources.assets,
      sources.rules,
      sources.intentDefinitions,
      sources.calibrationProfiles,
      sources.strategyGroups,
      sources.guidelines,
      prepared.dto,
      understanding,
      false,
      { canonicalTranscript: prepared.canonicalTranscript },
    );
    const analysisRecord = await this.persistAnalysis({
      sessionId: prepared.sessionId,
      tenantId: identity.role.tenantId,
      runType: 'COMPILE',
      latestMessage: prepared.dto.message,
      compiled,
      understanding,
      user,
    });
    await this.persistSessionContext(prepared.sessionId, identity.role.tenantId, prepared.dto, understanding, null, false, [], identity.businessScope);
    return {
      ...compiled,
      tuningSession: prepared.sessionSummary,
      analysisRecord,
    };
  }

  async execute(
    dto: ExecuteCustomerServiceSimulationDto,
    user: CurrentUserPayload,
    options: CustomerServiceSimulationExecutionOptions = {},
  ): Promise<CustomerServiceSimulationExecutionResult & Record<string, unknown>> {
    const executionStartedAt = Date.now();
    const prepared = await this.prepareDto(dto, user, options);
    const identity = await this.loadIdentity(prepared.dto, user);
    const existingSessionCustomerMessage = prepared.sessionId && prepared.dto.clientMessageId
      ? await this.tuningSessionRepository.findMessageByClientId(
          prepared.sessionId,
          identity.role.tenantId,
          prepared.dto.clientMessageId,
        )
      : null;
    if (existingSessionCustomerMessage
      && String(existingSessionCustomerMessage.content || '').trim() !== String(prepared.dto.message || '').trim()) {
      throw new BadRequestException('同一会话消息 ID 不能用于不同内容');
    }
    const fixedQaMatch = await this.resolveFixedQa(prepared.dto, identity);
    const heuristic = this.understandingService.understand(prepared.dto);
    let understanding = heuristic;
    if (!fixedQaMatch) {
      const recognitionCatalog = filterCustomerServiceIntentItems(
        await this.intentDefinitionRepository.findRecognitionCatalog(
          identity.role.tenantId,
          identity.industry?.code || null,
        ),
        resolveCustomerServiceIntentFlowPreferences(identity),
      );
      understanding = await this.deepRecognitionService.refine(prepared.dto, heuristic, recognitionCatalog);
      understanding = await this.collectRecognizedIntents(prepared.dto, understanding, identity);
    }
    const conversationState = summarizeCustomerServiceConversationState(
      readCustomerServiceConversationStateV2(prepared.dto.conversationState),
      prepared.dto.message,
    );
    const sources = await this.loadSources(prepared.dto, understanding, identity, conversationState, fixedQaMatch);
    understanding = {
      ...understanding,
      factOwnership: finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
        ownership: understanding.factOwnership,
        primaryScenario: understanding.primaryScenario,
        primaryIntent: understanding.primaryIntent,
        message: prepared.dto.message,
        namedOfferingMentionSpans: understanding.namedOfferingMentionSpans,
        priorDeliveredGroundingRefs: readLatestDeliveredGroundingRefs(prepared.dto.conversationState),
        contextualReferentSelection: understanding.contextualReferentSelection,
        knowledgeEntries: sources.businessContext.knowledgeEntries,
      }),
    };
    const compiled = this.compiler.compile(
      sources.role,
      sources.industry,
      sources.businessContext,
      sources.assets,
      sources.rules,
      sources.intentDefinitions,
      sources.calibrationProfiles,
      sources.strategyGroups,
      sources.guidelines,
      prepared.dto,
      understanding,
      dto.generateReply !== false,
      { canonicalTranscript: prepared.canonicalTranscript },
    );
    const hveExecutionLane = compiled.contract.orchestrationPlan.interactionExecution?.lane || 'HVE_ACTIVE';
    const hveCustomerVisible = hveExecutionLane === 'HVE3_CANDIDATE' || hveExecutionLane === 'HVE_ACTIVE';
    if (!hveCustomerVisible) {
      throw new BadRequestException({
        code: 'HVE_EXECUTION_LANE_UNAVAILABLE',
        message: `当前执行通道 ${hveExecutionLane} 已退役；请使用 HVE3_CANDIDATE 或 HVE_ACTIVE。`,
      });
    }
    const hveV19Activation = inspectCustomerServiceHveV19Activation({
      posture: compiled.contract.persona.interactionPostureProjection,
      guidelines: sources.guidelines,
      publicRelation: compiled.contract.identity.merchantRole.publicRelation,
      businessLabels: [compiled.contract.orchestrationPlan.identityConstraint.customerVisibleIdentity.businessLabel],
    });
    if (!fixedQaMatch && hveExecutionLane === 'HVE3_CANDIDATE' && options.sessionPurpose === 'ROBOT_TEST_DM' && hveV19Activation && !hveV19Activation.ready) {
      const blockers: string[] = [];
      if (hveV19Activation.blockerCodes.includes('ROLE_POSTURE_NOT_TYPED')) {
        blockers.push('当前 Active Role 尚未显式启用结构化 Interaction Posture，请先在业务角色的 SERVICE_POSTURE 中启用并保存 V1.9 互动姿态');
      }
      if (hveV19Activation.blockerCodes.includes('SYSTEM_GUIDELINES_MISSING')) {
        blockers.push(`System Guideline 尚未同步到 V1.9 Correction（缺少：${hveV19Activation.missingSystemGuidelineCodes.join('、')}），请先执行 Foundation Sync`);
      }
      if (hveV19Activation.blockerCodes.includes('SYSTEM_GUIDELINE_SEMANTICS_OUTDATED')) {
        blockers.push(`System Guideline 仍是旧行为语义（${hveV19Activation.semanticMismatchCodes.join('、')}），请重新执行 Foundation Sync`);
      }
      if (hveV19Activation.blockerCodes.includes('PUBLIC_RELATION_NOT_READY')) {
        blockers.push('当前 Active Role 的“对外关系称谓”不可用于客户可见身份，请改成例如“售后客服 / 技术支持 / 搭配师”这样的短称谓后保存');
      }
      const message = `HVE V1.9 Candidate 未激活：${blockers.join('；')}。本次未进入 HVE 回复生成。`;
      throw new BadRequestException({
        code: 'HVE_V19_ACTIVATION_BLOCKED',
        message,
        activation: hveV19Activation,
      });
    }
    const hve3 = await this.hve3Execution.execute({
      contract: compiled.contract,
      generateReply: dto.generateReply !== false,
    });
    let generation = hve3.generation;
    const quality = hve3.quality;
    const pipelineWarnings: string[] = hve3.warnings;

    compiled.contract.responseControl.qualityGate = quality.status;
    generation = finalizeCustomerServiceDelivery({
      contract: compiled.contract,
      generation,
      quality,
    });

    const warnings = [...compiled.warnings, ...pipelineWarnings];
    if (generation.status === 'MODEL_NOT_CONFIGURED') {
      warnings.push('未配置 DeepSeek API Key，已完成角色、上下文和生成计划编译，但未生成模型回复。');
    }
    if (['MODEL_ERROR', 'GENERATION_EMPTY', 'GENERATION_TRUNCATED', 'GENERATION_TIMEOUT', 'INVALID_RESPONSE'].includes(generation.status) && generation.errorMessage) {
      warnings.push(`模型生成失败：${generation.errorMessage}`);
    }

    let customerMessageId: string | null = existingSessionCustomerMessage?.id || null;
    if (prepared.sessionId && !existingSessionCustomerMessage) {
      try {
        const customerMessage = await this.tuningSessionRepository.appendMessage({
          sessionId: prepared.sessionId,
          tenantId: identity.role.tenantId,
          role: 'CUSTOMER',
          content: prepared.dto.message,
          clientMessageId: prepared.dto.clientMessageId || null,
        });
        customerMessageId = customerMessage?.id || null;
      } catch (error) {
        // The customer-visible Final Candidate already exists. Tuning/test persistence may lose
        // observability/history for this turn, but it must never retroactively veto the reply.
        this.logger.warn(`客户消息持久化失败，保留已生成回复：${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const totalElapsedMs = Date.now() - executionStartedAt;
    const recognitionElapsedMs = compiled.understanding.recognitionModel.elapsedMs || 0;
    const generationModelElapsedMs = generation.totalModelElapsedMs || generation.elapsedMs || 0;
    const performance = {
      totalElapsedMs,
      recognitionElapsedMs,
      generationModelElapsedMs,
      localProcessingElapsedMs: Math.max(0, totalElapsedMs - recognitionElapsedMs - generationModelElapsedMs),
      modelCallCount: generation.modelCallCount + recognitionModelCallCount(compiled.understanding),
      recognitionPath: compiled.understanding.recognitionModel.status === 'FAST_PATH'
        ? 'FAST_PATH' as const
        : compiled.understanding.recognitionModel.status === 'SUCCESS'
          ? (compiled.understanding.recognitionModel.repairAttempted ? 'MODEL_REGENERATION' as const : 'MODEL' as const)
          : compiled.understanding.source === 'HEURISTIC'
            ? 'HEURISTIC_FALLBACK' as const
            : 'MODEL' as const,
    };

    generation = { ...generation, pipelinePerformance: performance };
    const execution = {
      ...compiled,
      warnings,
      executedAt: new Date().toISOString(),
      generation,
      quality,
      performance,
      hveV19Activation,
    } satisfies CustomerServiceSimulationExecutionResult;
    const analysisRecord = await this.persistAnalysis({
      sessionId: prepared.sessionId,
      tenantId: identity.role.tenantId,
      customerMessageId,
      runType: 'EXECUTE',
      latestMessage: prepared.dto.message,
      compiled,
      understanding: compiled.understanding,
      generation,
      quality,
      warnings,
      user,
    });
    if (!existingSessionCustomerMessage) {
      const planFulfillment = resolveCustomerServicePlanFulfillmentFromReplyTrace({
        fallbackUsed: generation.fallbackUsed,
        generationDetails: generation,
        runtimeContract: compiled.contract,
      });
      const deliveredGroundingRefs = planFulfillment === 'NOT_FULFILLED'
        ? []
        : extractCustomerServiceProvenGroundingRefsFromReplyTrace(generation);
      const deliveredGroundedUnits = planFulfillment === 'NOT_FULFILLED'
        ? []
        : extractCustomerServiceProvenGroundedUnitsFromReplyTrace(generation);
      await this.persistSessionContext(
        prepared.sessionId,
        identity.role.tenantId,
        prepared.dto,
        compiled.understanding,
        options.sessionPurpose === 'ROBOT_TEST_DM' ? null : generation.draft,
        true,
        customerMessageId ? [customerMessageId] : [],
        identity.businessScope,
        options.sessionPurpose === 'ROBOT_TEST_DM' ? undefined : {
          replyAttemptId: readRecordId(analysisRecord),
          behaviorPlan: planFulfillment === 'NOT_FULFILLED'
            ? null
            : extractCustomerServiceBehaviorPlanFromRuntimeContract(compiled.contract),
          interactionPlanV2: planFulfillment === 'NOT_FULFILLED'
            ? null
            : extractCustomerServiceInteractionPlanV2FromRuntimeContract(compiled.contract),
          planFulfillment,
          realizedGroundingRefs: deliveredGroundingRefs,
          provenGroundedUnits: deliveredGroundedUnits,
        },
      );
    }

    return {
      ...execution,
      tuningSession: prepared.sessionSummary,
      analysisRecord,
    };
  }


  async executeWithTrace(
    dto: ExecuteCustomerServiceSimulationDto,
    user: CurrentUserPayload,
  ): Promise<CustomerServiceSimulationExecutionResult & Record<string, unknown>> {
    const result = await this.execute(dto, user);
    const deliverySegments = result.generation.deliveryPlan?.segments?.map((segment) => ({
      index: segment.index,
      content: segment.content,
      delayBeforeMs: segment.delayBeforeMs,
    })) || [];
    const fallbackDraft = result.generation.draft?.trim();
    const segments = deliverySegments.length
      ? deliverySegments
      : fallbackDraft
        ? [{ index: 0, content: fallbackDraft, delayBeforeMs: 0 }]
        : [];
    const analysisId = readRecordId(result.analysisRecord);
    try {
      const tenantId = resolveRequiredTenantId(user);
      const trace = await this.replyTraces.createRuntimeTrace({
        tenantId,
        createdById: user.id,
        dto,
        context: {
          sourceType: 'TUNING_SIMULATION',
          sourceRefId: analysisId || dto.tuningSessionId || undefined,
          channel: readDtoVariable(dto.variables, 'channel'),
          platform: readDtoVariable(dto.variables, 'platform'),
          conversationId: dto.tuningSessionId,
          customerMessageId: dto.clientMessageId,
          replyAttemptId: analysisId || undefined,
          postContext: readDtoVariable(dto.variables, 'postContext'),
          conversationSnapshot: {
            history: dto.conversationHistory || [],
            state: dto.conversationState || null,
            variables: dto.variables || {},
            facts: dto.facts || [],
          },
        },
        result,
        segments,
        qualityStatus: result.generation.candidateQualityStatus || result.quality.status,
        safetyStatus: result.generation.candidateSafetyStatus || 'NOT_RUN',
        fallbackUsed: Boolean(result.generation.fallbackUsed),
      });
      return { ...result, replyTraceId: trace.id };
    } catch (traceError) {
      this.logger.error(`调优 Reply Trace 保存失败，保留原调优结果：${traceError instanceof Error ? traceError.message : String(traceError)}`);
      return result;
    }
  }

  private async prepareDto<T extends CompileCustomerServiceSimulationDto>(
    dto: T,
    user: CurrentUserPayload,
    options: CustomerServiceSimulationExecutionOptions = {},
  ): Promise<{ dto: T; sessionId: string | null; sessionSummary: Record<string, unknown> | null; sessionScopeFingerprint: string | null; canonicalTranscript: CustomerServiceCanonicalTranscriptV1 | null }> {
    const sessionId = dto.tuningSessionId?.trim() || null;
    if (!sessionId) return { dto, sessionId: null, sessionSummary: null, sessionScopeFingerprint: null, canonicalTranscript: null };
    const tenantId = resolveRequiredTenantId(user);
    const session = await this.tuningSessionRepository.findScoped(sessionId, tenantId);
    const expectedPurpose = options.sessionPurpose || 'TUNING';
    if (!session || session.purpose !== expectedPurpose) {
      throw new NotFoundException(expectedPurpose === 'ROBOT_TEST_DM' ? '机器人测试会话不存在或不属于当前租户' : '回复调优对话不存在或不属于当前租户');
    }
    if (session.status !== 'ACTIVE') throw new BadRequestException('当前调优对话已归档，请新建对话后继续');

    const messages = await this.tuningSessionRepository.listMessages(sessionId, tenantId, 60);
    const snapshot = asRecord(session.contextSnapshot);
    const sessionState = readCustomerServiceConversationStateV2(asRecord(snapshot.conversationStateV2));
    const evidenceIds = extractConversationStateEvidenceMessageIds(sessionState);
    const evidenceMessages = evidenceIds.length
      ? await this.tuningSessionRepository.listMessagesByIds(sessionId, tenantId, evidenceIds)
      : [];
    const notFulfilledAssistantMessageIds = new Set(
      sessionState.assistantMoveLedger
        .filter((item) => item.behavior?.planFulfillment === 'NOT_FULFILLED')
        .flatMap((item) => item.behavior?.evidenceMessageIds || [])
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    );
    const physicalContextRows = uniqueDialogueRowsById([...messages, ...evidenceMessages]
      .filter((item) => item.role === 'CUSTOMER' || item.role === 'ASSISTANT')
      .map((item) => ({
        id: item.id,
        clientMessageId: item.clientMessageId,
        senderRole: item.role === 'ASSISTANT' ? 'account' : 'user',
        textContent: String(item.content || '').trim(),
        turnNo: item.turnNo,
      }))
      .filter((item) => Boolean(item.textContent))
      .sort((a, b) => Number(a.turnNo || 0) - Number(b.turnNo || 0)));
    const logicalContextRows = coalesceDialogueActiveContextRows(physicalContextRows);
    const storedHistory = logicalContextRows.map((item) => ({
      role: item.senderRole === 'account' ? 'ASSISTANT' as const : 'CUSTOMER' as const,
      content: item.textContent,
    }));
    const canonicalSummaryHistory = coalesceConversationHistory(messages
      .filter((item) => item.role === 'CUSTOMER' || item.role === 'ASSISTANT')
      .filter((item) => item.role !== 'ASSISTANT' || !notFulfilledAssistantMessageIds.has(String(item.id || '').trim()))
      .map((item) => ({ role: item.role as 'CUSTOMER' | 'ASSISTANT', content: item.content })));
    // This is the only Summary-history authority for tuning / Robot Test
    // sessions. Explicit NOT_FULFILLED assistant outputs are excluded by the
    // existing server-owned planFulfillment/evidenceMessageIds lifecycle; no
    // fallback wording, regex, or client history is allowed to decide this.
    const canonicalTranscript = buildCustomerServiceServerCanonicalTranscript({
      source: 'TUNING_SESSION_MESSAGES',
      sourceId: session.id,
      revision: Number(session.messageCount || messages.length || 0),
      messages: canonicalSummaryHistory,
    });
    const activeContextProvided = hasBudgetSelectedActiveContext(dto.variables) && Array.isArray(dto.conversationHistory);
    let activeContextWindow = activeContextProvided ? asRecord(asRecord(dto.variables).activeContextWindow) : null;
    let history = activeContextProvided
      ? coalesceConversationHistory(dto.conversationHistory || [])
      : storedHistory;
    if (!activeContextProvided) {
      const budget = DIALOGUE_ACTIVE_CONTEXT_DEFAULT_TOKEN_BUDGET;
      const estimatedCurrentMessageTokens = estimateDialogueContextTextTokens(dto.message) + (dto.message ? 6 : 0);
      const internalStateSummary = summarizeCustomerServiceConversationState(sessionState, dto.message);
      const budgetStateProjection = projectCustomerServiceActiveContextBudgetState(sessionState, dto.message);
      const estimatedInternalStateTokens = estimateDialogueContextJsonTokens(internalStateSummary);
      const estimatedStateTokens = estimateDialogueContextJsonTokens(budgetStateProjection);
      const historyTokenBudget = Math.max(0, budget - estimatedCurrentMessageTokens - estimatedStateTokens);
      const selection = selectDialogueActiveContextRows({
        effectiveRows: logicalContextRows,
        evidenceIds,
        historyTokenBudget,
        candidateComplete: Number(session.messageCount || 0) <= 60,
        recentTokenRatio: DIALOGUE_ACTIVE_CONTEXT_RECENT_TOKEN_RATIO,
      });
      history = selection.selectedRows.map((item) => ({
        role: item.senderRole === 'account' ? 'ASSISTANT' as const : 'CUSTOMER' as const,
        content: item.textContent,
      }));
      activeContextWindow = {
        budgetApplied: true,
        selectionMode: selection.selectionMode,
        tokenBudget: budget,
        estimatedTokens: estimatedCurrentMessageTokens + estimatedStateTokens + selection.estimatedHistoryTokens,
        estimatedCurrentMessageTokens,
        estimatedStateTokens,
        estimatedInternalStateTokens,
        estimatedHistoryTokens: selection.estimatedHistoryTokens,
        historyTokenBudget,
        allHistoryIncluded: selection.allHistoryIncluded,
        selectedMessageCount: selection.selectedRows.length,
        candidateMessageCount: logicalContextRows.length + (Number(session.messageCount || 0) > 60 ? 1 : 0),
        physicalMessageCount: physicalContextRows.length + (Number(session.messageCount || 0) > 60 ? 1 : 0),
        evidenceRecallCount: selection.evidenceRecallCount,
        sourceConversationIds: [],
        sourceConversationCount: 0,
        source: 'TUNING_SESSION',
        tuningSessionId: session.id,
        stateRevision: Number(session.stateRevision || 0),
        stateProjection: 'GENERATION_RELEVANT_BUDGET_V1',
      };
    }
    if (dto.merchantRoleId && session.merchantRoleId && dto.merchantRoleId !== session.merchantRoleId) {
      throw new BadRequestException('同一调优/机器人测试会话不能切换客服角色，请新建会话');
    }
    if (dto.accountProfileId !== undefined && dto.accountProfileId && session.accountProfileId && dto.accountProfileId !== session.accountProfileId) {
      throw new BadRequestException('同一调优/机器人测试会话不能切换账号资料，请新建会话');
    }
    if (dto.industryNodeId !== undefined && dto.industryNodeId && session.industryNodeId && dto.industryNodeId !== session.industryNodeId) {
      throw new BadRequestException('同一调优/机器人测试会话不能切换行业作用域，请新建会话');
    }
    const storedStoreProfileId = String(snapshot.storeProfileId || '').trim();
    if (dto.storeProfileId !== undefined && dto.storeProfileId && storedStoreProfileId && dto.storeProfileId !== storedStoreProfileId) {
      throw new BadRequestException('同一调优/机器人测试会话不能切换店铺资料，请新建会话');
    }
    const effectiveDto = {
      ...dto,
      merchantRoleId: dto.merchantRoleId || session.merchantRoleId,
      accountProfileId: dto.accountProfileId === undefined
        ? session.accountProfileId || String(snapshot.accountProfileId || '') || undefined
        : dto.accountProfileId,
      storeProfileId: dto.storeProfileId === undefined
        ? session.accountProfile?.storeProfileId || String(snapshot.storeProfileId || '') || undefined
        : dto.storeProfileId,
      industryNodeId: dto.industryNodeId === undefined ? session.industryNodeId || undefined : dto.industryNodeId,
      recognitionSessionId: sessionId,
      conversationHistory: history,
      customerState: { ...asRecord(snapshot.customerState), ...asRecord(dto.customerState) },
      variables: {
        ...asRecord(snapshot.variables),
        ...asRecord(dto.variables),
        ...(activeContextWindow ? { activeContextWindow } : {}),
        ...(expectedPurpose === 'ROBOT_TEST_DM' ? {
          __runtimeCalibrationScope: {
            robotId: String(snapshot.robotId || '').trim() || null,
            authority: 'SERVER_TUNING_SESSION',
          },
        } : {}),
      },
      facts: dto.facts ?? (Array.isArray(snapshot.facts) ? snapshot.facts as Record<string, unknown>[] : []),
      conversationState: customerServiceLongHorizonStateEnabled()
        ? asRecord(snapshot.conversationStateV2)
        : {},
      stateRevision: Number(session.stateRevision || 0),
    } as T;
    return {
      dto: effectiveDto,
      sessionId,
      sessionScopeFingerprint: String(snapshot.businessScopeFingerprint || asRecord(snapshot.businessScope).fingerprint || '').trim() || null,
      canonicalTranscript,
      sessionSummary: {
        id: session.id,
        title: session.title,
        purpose: session.purpose,
        status: session.status,
        messageCount: session.messageCount,
        analysisCount: session.analysisCount,
        stateSchemaVersion: session.stateSchemaVersion,
        stateRevision: session.stateRevision,
        contextPayloadBytes: session.contextPayloadBytes,
        updatedAt: session.updatedAt,
      },
    };
  }

  private assertPreparedSessionBusinessScope(
    storedFingerprint: string | null,
    currentScope: CustomerServiceEffectiveBusinessScopeV1,
  ) {
    if (!storedFingerprint || storedFingerprint === currentScope.fingerprint) return;
    throw new BadRequestException({
      code: 'BUSINESS_SCOPE_SESSION_MISMATCH',
      message: '当前会话的业务作用域已发生变化，请新建会话后继续，旧上下文不会跨角色/账号/店铺/行业复用',
      storedFingerprint,
      currentFingerprint: currentScope.fingerprint,
    });
  }

  private async persistAnalysis(input: {
    sessionId: string | null;
    tenantId: string;
    customerMessageId?: string | null;
    runType: 'COMPILE' | 'EXECUTE';
    latestMessage: string;
    compiled: ReturnType<CustomerServiceRuntimeContractCompiler['compile']>;
    understanding: CustomerServiceMessageUnderstanding;
    generation?: unknown;
    quality?: unknown;
    warnings?: string[];
    user: CurrentUserPayload;
  }) {
    if (!input.sessionId) return null;
    try {
      const maxJsonBytes = Math.max(16_384, Number(process.env.CUSTOMER_SERVICE_JSON_MAX_BYTES || 524_288));
      const boundedUnderstanding = boundJsonPayload(input.understanding, maxJsonBytes);
      const boundedContract = boundJsonPayload(input.compiled.contract, maxJsonBytes);
      const boundedGeneration = boundJsonPayload(input.generation ?? null, maxJsonBytes);
      const boundedQuality = boundJsonPayload(input.quality ?? null, maxJsonBytes);
      const boundedWarnings = boundJsonPayload(input.warnings || input.compiled.warnings, Math.min(maxJsonBytes, 256_000));
      const payloads = [boundedUnderstanding, boundedContract, boundedGeneration, boundedQuality, boundedWarnings];
      const payloadBytes = payloads.reduce((total, item) => total + item.originalBytes, 0);
      const truncatedFields = payloads.flatMap((item) => item.truncatedFields);
      const contentHash = stableJsonHash({
        understanding: input.understanding,
        runtimeContract: input.compiled.contract,
        generation: input.generation ?? null,
        quality: input.quality ?? null,
      });
      const analysis = await this.tuningSessionRepository.appendAnalysis({
        sessionId: input.sessionId,
        tenantId: input.tenantId,
        customerMessageId: input.customerMessageId || null,
        runType: input.runType,
        latestMessage: input.latestMessage,
        understanding: boundedUnderstanding.value as Prisma.InputJsonValue,
        runtimeContract: boundedContract.value as Prisma.InputJsonValue,
        generation: input.generation ? boundedGeneration.value as Prisma.InputJsonValue : null,
        quality: input.quality ? boundedQuality.value as Prisma.InputJsonValue : null,
        warnings: boundedWarnings.value as Prisma.InputJsonValue,
        summary: {
          ...input.compiled.summary,
          payloadMeta: {
            originalBytes: payloadBytes,
            storedBytes: payloads.reduce((total, item) => total + item.storedBytes, 0),
            truncated: payloads.some((item) => item.truncated),
            truncatedFields: [...new Set(truncatedFields)].slice(0, 200),
            contentHash,
          },
        } as unknown as Prisma.InputJsonValue,
        primaryScenario: input.understanding.primaryScenario,
        primaryIntent: input.understanding.primaryIntent,
        dominantTurnGoal: input.understanding.humanContext.dominantTurnGoal.key,
        recognitionPath: input.understanding.recognitionModel.status,
        generationModel: String((input.generation as { model?: unknown } | undefined)?.model || '') || null,
        qualityStatus: String((input.quality as { status?: unknown } | undefined)?.status || '') || null,
        feedbackType: input.understanding.humanContext.dialogueObligation.userFeedback,
        requestedDeltas: input.understanding.humanContext.dialogueObligation.requestedDeltas,
        stateRevision: input.compiled.contract.generationContext.conversationState.revision,
        configurationHash: input.compiled.contract.provenance.configurationHash,
        contentHash,
        payloadBytes,
        createdById: input.user.id,
      });
      return analysis
        ? { id: analysis.id, sequenceNo: analysis.sequenceNo, runType: analysis.runType, createdAt: analysis.createdAt }
        : null;
    } catch (error) {
      this.logger.warn(`调优分析记录保存失败，继续返回本轮结果：${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async persistSessionContext(
    sessionId: string | null,
    tenantId: string,
    dto: CompileCustomerServiceSimulationDto,
    understanding: CustomerServiceMessageUnderstanding,
    assistantDraft: string | null,
    advanceState: boolean,
    evidenceMessageIds: string[] = [],
    businessScope?: CustomerServiceEffectiveBusinessScopeV1 | null,
    assistantBehavior?: {
      replyAttemptId?: string | null;
      replyTraceId?: string | null;
      behaviorPlan?: unknown;
      interactionPlanV2?: unknown;
      planFulfillment?: 'FULFILLED' | 'NOT_FULFILLED' | 'UNKNOWN';
      realizedGroundingRefs?: string[];
      provenGroundedUnits?: Array<{ text: string; groundingRefs: string[] }>;
    },
  ) {
    if (!sessionId) return;
    try {
      const previousState = readCustomerServiceConversationStateV2(dto.conversationState);
      const nextState = advanceState
        ? reduceCustomerServiceConversationState({
            previous: previousState,
            dto,
            understanding,
            assistantDraft,
            evidenceMessageIds,
            assistantBehavior,
          })
        : { ...previousState, revision: Number(dto.stateRevision || 0) + 1, updatedAt: new Date().toISOString() };
      const contextSnapshot = {
          merchantRoleId: dto.merchantRoleId,
          accountProfileId: dto.accountProfileId || null,
          storeProfileId: dto.storeProfileId || null,
          industryNodeId: dto.industryNodeId || null,
          businessScope: businessScope || null,
          businessScopeFingerprint: businessScope?.fingerprint || null,
          customerState: dto.customerState || {},
          variables: dto.variables || {},
          facts: dto.facts || [],
          latestUnderstanding: {
            primaryScenario: understanding.primaryScenario,
            primaryIntent: understanding.primaryIntent,
            intentRanking: understanding.intentRanking,
            dominantTurnGoal: understanding.humanContext.dominantTurnGoal,
            rankedTurnGoals: understanding.humanContext.rankedTurnGoals,
            requiredTurnGoals: understanding.humanContext.requiredTurnGoals,
            requiredResponseActs: understanding.humanContext.requiredResponseActs,
            emotion: understanding.emotion,
            phase: understanding.humanContext.interactionStrategy.phase,
            replyStrategy: understanding.humanContext.replyStrategy,
            dialogueObligation: understanding.humanContext.dialogueObligation,
          },
          conversationStateV2: nextState,
        };
      const contextPayloadBytes = Buffer.byteLength(JSON.stringify(contextSnapshot), 'utf8');
      const updated = await this.tuningSessionRepository.updateConversationStateScoped({
        id: sessionId,
        tenantId,
        expectedRevision: Number(dto.stateRevision || 0),
        stateSchemaVersion: nextState.schemaVersion,
        contextPayloadBytes,
        contextSnapshot: contextSnapshot as Prisma.InputJsonValue,
      });
      if (!updated) {
        this.logger.warn(`调优对话上下文并发冲突，拒绝覆盖较新的状态：session=${sessionId} expectedRevision=${dto.stateRevision || 0}`);
      } else {
        await this.tuningSessionRepository.updateScoped(sessionId, tenantId, {
          accountProfileId: dto.accountProfileId || null,
          industryNodeId: dto.industryNodeId || null,
        });
      }
    } catch (error) {
      this.logger.warn(`调优对话上下文保存失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async collectRecognizedIntents(
    dto: CompileCustomerServiceSimulationDto,
    understanding: CustomerServiceMessageUnderstanding,
    identity: Awaited<ReturnType<CustomerServiceSimulationService['loadIdentity']>>,
  ) {
    try {
      const recognizedItems = await this.intentCandidateRepository.collect({
        tenantId: identity.role.tenantId,
        merchantRoleId: identity.role.id,
        industryNodeId: identity.industry?.id || null,
        industryCode: identity.industry?.code || null,
        latestMessage: dto.message.trim(),
        recognitionSessionId: dto.tuningSessionId?.trim() || dto.recognitionSessionId?.trim() || null,
        conversationHistory: (dto.conversationHistory ?? []).map((item) => ({ role: item.role, content: item.content })),
        recognizedItems: understanding.recognizedItems,
        understandingSnapshot: {
          source: understanding.source,
          primaryScenario: understanding.primaryScenario,
          primaryIntent: understanding.primaryIntent,
          intentRanking: understanding.intentRanking,
          riskLevel: understanding.riskLevel,
          emotion: understanding.emotion,
          humanContext: understanding.humanContext,
          recognitionModel: understanding.recognitionModel,
        },
      });
      return { ...understanding, recognizedItems };
    } catch (error) {
      this.logger.warn(`客户意图候选收集失败，继续返回识别结果：${error instanceof Error ? error.message : String(error)}`);
      return {
        ...understanding,
        reasons: [...understanding.reasons, '候选意图暂未持久化；识别与回复流程继续执行。'],
      };
    }
  }

  private async loadIdentity(dto: CompileCustomerServiceSimulationDto, user: CurrentUserPayload) {
    const tenantId = resolveTenantId(user);
    const role = await this.repository.findMerchantRole(dto.merchantRoleId, tenantId);
    if (!role) throw new NotFoundException('客服角色不存在');
    const accountProfile = dto.accountProfileId
      ? await this.contextProfileRepository.findAccount(dto.accountProfileId, role.tenantId)
      : null;
    if (dto.accountProfileId && (!accountProfile || accountProfile.status !== 'ENABLED')) {
      throw new BadRequestException('所选账号背景不存在、未启用或不属于当前租户');
    }
    if (accountProfile?.merchantRoleId && accountProfile.merchantRoleId !== role.id) {
      throw new BadRequestException('所选账号背景绑定的客服角色与当前角色不一致');
    }
    const accountStoreId = accountProfile?.storeProfileId || null;
    if (dto.storeProfileId && accountStoreId && dto.storeProfileId !== accountStoreId) {
      throw new BadRequestException('所选店铺背景与账号背景的绑定关系不一致');
    }
    const storeProfileId = dto.storeProfileId || accountStoreId;
    const storeProfile = storeProfileId
      ? await this.contextProfileRepository.findStore(storeProfileId, role.tenantId)
      : null;
    if (storeProfileId && (!storeProfile || storeProfile.status !== 'ENABLED')) {
      throw new BadRequestException('所选店铺背景不存在、未启用或不属于当前租户');
    }
    const industryNodeId = dto.industryNodeId || accountProfile?.industryNodeId || null;
    const industry = industryNodeId
      ? await this.repository.findIndustryNode(industryNodeId, role.tenantId)
      : role.industryNode;
    if (industryNodeId && !industry) throw new BadRequestException('所选行业节点不存在或不属于当前租户');
    const scopeResolution = resolveCustomerServiceEffectiveBusinessScope({
      tenantId: role.tenantId,
      merchantRoleId: role.id,
      roleIndustryNodeId: role.industryNodeId,
      accountProfileId: accountProfile?.id || null,
      accountMerchantRoleId: accountProfile?.merchantRoleId || null,
      accountStoreProfileId: accountProfile?.storeProfileId || null,
      accountIndustryNodeId: accountProfile?.industryNodeId || null,
      storeProfileId: storeProfile?.id || null,
      industryNodeId: industry?.id || null,
      industryCode: industry?.code || null,
    });
    if (scopeResolution.issueKeys.length) {
      throw new BadRequestException({
        code: 'BUSINESS_SCOPE_INVARIANT_FAILED',
        message: '当前角色、账号、店铺或行业绑定不一致，请修正配置后新建会话',
        issueKeys: scopeResolution.issueKeys,
      });
    }
    return { role, industry, accountProfile, storeProfile, businessScope: scopeResolution.scope };
  }

  private resolveFixedQa(
    dto: CompileCustomerServiceSimulationDto,
    identity: Awaited<ReturnType<CustomerServiceSimulationService['loadIdentity']>>,
  ) {
    return this.knowledgeEntriesService.resolveFixedQaForRuntime({
      tenantId: identity.role.tenantId,
      accountProfileId: identity.accountProfile?.id || undefined,
      storeProfileId: identity.storeProfile?.id || undefined,
      merchantRoleId: identity.role.id,
      message: dto.message,
    });
  }

  private async loadSources(
    dto: CompileCustomerServiceSimulationDto,
    understanding: CustomerServiceMessageUnderstanding,
    identity: Awaited<ReturnType<CustomerServiceSimulationService['loadIdentity']>>,
    conversationState: CustomerServiceConversationStateSummary,
    fixedQaMatch: Awaited<ReturnType<CustomerServiceSimulationService['resolveFixedQa']>> = null,
  ) {
    const { role, industry, accountProfile, storeProfile, businessScope } = identity;
    const requestedAssetIds = dto.assetIds ?? [];
    const assets = await this.repository.findPublishedAssets(requestedAssetIds, role.tenantId);
    if (assets.length !== requestedAssetIds.length) {
      throw new BadRequestException('部分配置资产不存在、未发布或不属于当前租户');
    }
    const strategyVersionIds = dto.strategyVersionIds ?? [];
    const conversationStrategy = resolveCustomerServiceConversationStrategyPreferences({ storeProfile, accountProfile });
    const requiredKnowledgeRoles = resolveRequiredKnowledgeRetrievalRoles(understanding);
    const priorDeliveredGroundingRefs = resolveCustomerServiceProvenEvidenceRecall({
      understanding,
      assistantMoveLedger: readCustomerServiceConversationStateV2(dto.conversationState).assistantMoveLedger,
    });
    const runtimeInputBudgetPlan = planCustomerServiceRuntimeInputBudget({
      latestMessage: dto.message,
      conversationHistory: dto.conversationHistory,
      conversationState,
      activeContextWindow: asRecord(asRecord(dto.variables).activeContextWindow),
      storeProfile,
      accountProfile,
      conversationStrategy,
    });
    const [
      rules,
      intentDefinitions,
      calibrationProfiles,
      publishedStrategyGroups,
      draftStrategyGroups,
      allLanguagePolicies,
      knowledgeSelection,
      publishedGuidelineRows,
    ] = await Promise.all([
      this.repository.findEnabledResponseRules(role.tenantId),
      this.intentDefinitionRepository.findRuntimeMatches(
        role.tenantId,
        understanding.primaryScenario,
        understanding.primaryIntent,
        industry?.code || null,
        understanding.recognizedItems
          .filter((item) => item.type === 'INTENT' && item.matchStatus === 'EXACT' && item.matchedDefinition)
          .map((item) => item.matchedDefinition!.id),
      ),
      this.calibrationProfileRepository.findActiveMatching({
        tenantId: role.tenantId,
        merchantRoleId: role.id,
        accountProfileId: accountProfile?.id || null,
        robotId: readRuntimeCalibrationRobotId(dto.variables),
        industryNodeId: industry?.id || null,
        scenario: understanding.primaryScenario,
        intent: understanding.primaryIntent,
        riskLevel: understanding.riskLevel,
      }),
      this.repository.findPublishedStrategyGroups(role.tenantId),
      this.repository.findStrategyGroupVersions(strategyVersionIds, role.tenantId),
      this.contextProfileRepository.listEnabledPolicies(role.tenantId),
      this.knowledgeEntriesService.selectForRuntimeDetailed({
        tenantId: role.tenantId,
        accountProfileId: accountProfile?.id,
        storeProfileId: storeProfile?.id,
        merchantRoleId: role.id,
        message: dto.message,
        namedOfferingMentionSpans: understanding.namedOfferingMentionSpans,
        scenario: understanding.primaryScenario,
        intent: understanding.primaryIntent,
        topics: understanding.topics.flatMap((item) => [item.scenario, item.intent, ...item.evidence]),
        conversationState,
        conversationStrategy,
        requiredKnowledgeRoles,
        priorDeliveredGroundingRefs,
        maxEstimatedTokens: runtimeInputBudgetPlan.knowledgeTokenBudget,
        businessScope,
      }),
      this.guidelineRepository.findPublishedForRuntime(role.tenantId),
    ]);
    if (draftStrategyGroups.length !== strategyVersionIds.length) {
      throw new BadRequestException('部分策略草稿版本不存在、已归档或不属于当前租户。');
    }
    const overriddenAssetIds = new Set(draftStrategyGroups.map((item) => item.asset.id));
    const strategyGroups = [
      ...publishedStrategyGroups.filter((item) => !overriddenAssetIds.has(item.asset.id)),
      ...draftStrategyGroups,
    ];
    const effectiveIntentDefinitions = filterCustomerServiceIntentItems(
      intentDefinitions,
      resolveCustomerServiceIntentFlowPreferences({ storeProfile, accountProfile }),
    );
    const languagePolicies = selectEffectiveLanguagePolicies(allLanguagePolicies, {
      storeProfileId: storeProfile?.id,
      accountProfileId: accountProfile?.id,
      merchantRoleId: role.id,
      channel: accountProfile?.channel,
      scenario: understanding.primaryScenario,
      intent: understanding.primaryIntent,
    });
    const knowledgeEntries = knowledgeSelection.selected;
    const runtimeInputBudget = finalizeCustomerServiceRuntimeInputBudget(runtimeInputBudgetPlan, knowledgeEntries);
    const guidelines = normalizeCustomerServicePublishedGuidelines(publishedGuidelineRows);
    return {
      role,
      industry,
      businessContext: { storeProfile, accountProfile, languagePolicies, knowledgeEntries, knowledgeSelection, businessScope, runtimeInputBudget, conversationStrategy, fixedQaMatch },
      assets,
      rules,
      intentDefinitions: effectiveIntentDefinitions,
      calibrationProfiles,
      strategyGroups,
      guidelines,
    };
  }
}


function resolveRequiredKnowledgeRetrievalRoles(
  understanding: CustomerServiceMessageUnderstanding,
) {
  const requiresCurrentOptionAssessmentGuide = (understanding.humanContext.requiredTurnGoals || []).some((goal) => (
    !goal.deferred
    && goal.requestedContributionKind === 'DECISION_SUPPORT'
    && goal.requestedEvidenceScope === 'MERCHANT_BUSINESS'
    && goal.requestedDecisionMode === 'ASSESS_CURRENT_OPTION'
  ));
  return requiresCurrentOptionAssessmentGuide
    ? ['CURRENT_OPTION_ASSESSMENT_GUIDE' as const]
    : [];
}

function readLatestDeliveredGroundingRefs(value: unknown) {
  const state = readCustomerServiceConversationStateV2(value);
  const latestAssistant = state.assistantMoveLedger.at(-1);
  return [...new Set((latestAssistant?.behavior?.realizedGroundingRefs || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean))].slice(0, 32);
}

function hasBudgetSelectedActiveContext(variables: unknown) {
  const record = asRecord(variables);
  const window = asRecord(record.activeContextWindow);
  return window.budgetApplied === true;
}

function readSimulationProfileText(value: unknown, key: string) {
  const candidate = asRecord(value)[key];
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readRuntimeCalibrationRobotId(variables: unknown) {
  const scope = asRecord(asRecord(variables).__runtimeCalibrationScope);
  const robotId = typeof scope.robotId === 'string' ? scope.robotId.trim() : '';
  return robotId || null;
}

function coalesceConversationHistory(
  messages: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>,
) {
  const result: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }> = [];
  for (const message of messages) {
    const content = String(message.content || '').trim();
    if (!content) continue;
    const previous = result[result.length - 1];
    if (previous && previous.role === message.role && message.role === 'ASSISTANT') {
      previous.content = `${previous.content}

${content}`;
    } else {
      result.push({ role: message.role, content });
    }
  }
  return result;
}

function recognitionModelCallCount(understanding: CustomerServiceMessageUnderstanding) {
  const meta = understanding.recognitionModel;
  if (!meta.attempted || meta.status === 'FAST_PATH' || meta.status === 'NOT_REQUESTED') return 0;
  return meta.repairAttempted ? 2 : 1;
}

function readRecordId(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = (value as Record<string, unknown>).id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function readDtoVariable(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = (value as Record<string, unknown>)[key];
  return typeof item === 'string' && item.trim() ? item.trim() : undefined;
}
