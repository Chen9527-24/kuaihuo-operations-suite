import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId } from '../../../../common/utils/tenant-scope';
import { CustomerServiceRuntimeReplyRequestRepository } from '../../infrastructure/persistence/customer-service-runtime-reply-request.repository';
import { stableJsonHash } from '../../shared/utils/stable-json-hash.util';
import { CustomerServiceSimulationService } from '../simulation/customer-service-simulation.service';
import { CustomerServiceReplyTracesService, CustomerServiceReplyTraceContext } from '../../admin/reply-traces/customer-service-reply-traces.service';
import { CustomerServiceCanonicalConversationStateService, CustomerServiceCanonicalProjectionResult } from '../state/customer-service-canonical-conversation-state.service';
import { ExecuteCustomerServiceRuntimeReplyDto } from './dto/execute-runtime-reply.dto';
import { buildCustomerServiceExactSingleDeliveryPlan } from '../generation/customer-service-message-delivery-planner';
import { projectCustomerServiceDecisionIntegrityDiagnostics } from '../diagnostics/customer-service-decision-integrity-diagnostics';
import type { CustomerServiceInteractionPlanV2 } from '../interaction/customer-service-interaction-plan.type';
import {
  extractCustomerServiceBehaviorPlanFromRuntimeContract,
  extractCustomerServiceInteractionPlanV2FromRuntimeContract,
  extractCustomerServiceProvenGroundingRefsFromReplyTrace,
  extractCustomerServiceProvenGroundedUnitsFromReplyTrace,
  resolveCustomerServicePlanFulfillmentFromReplyTrace,
} from '../behavior/customer-service-behavior-memory.util';

export type CustomerServiceRuntimeAssistantObservationProof = {
  authority: 'SERVER_RUNTIME_ASSISTANT_OBSERVATION_V1';
  source: 'RUNTIME_EXECUTION_AFTER_CONFORMANCE';
  planFulfillment: 'FULFILLED' | 'NOT_FULFILLED' | 'UNKNOWN';
  behaviorPlan: unknown;
  interactionPlanV2: unknown;
  realizedGroundingRefs: string[];
  provenGroundedUnits: Array<{ text: string; groundingRefs: string[] }>;
};

export type CustomerServiceRuntimeReplyEnvelope = {
  requestId: string;
  idempotencyKey: string;
  deliveryDecision: string;
  segments: Array<{ index: number; content: string; delayBeforeMs: number }>;
  safetyStatus: string;
  qualityStatus: string;
  replySource: string;
  fallbackUsed: boolean;
  replyTraceId?: string;
  cancelRemainingOnCustomerMessage?: boolean;
  diagnostics?: Record<string, unknown>;
  /** Robot Test only: server-owned post-Conformance proof for next-turn state transport. */
  assistantObservationProof?: CustomerServiceRuntimeAssistantObservationProof;
};

export type CustomerServiceRuntimeReplyExecutionOptions = {
  allowIsolatedTestSession?: boolean;
};

const RUNTIME_PROCESSING_LEASE_MS = 120_000;
const DEFAULT_IDEMPOTENCY_RETENTION_DAYS = 30;

/**
 * F0.1 diagnostics semantics only. These labels exist to prevent Robot/Test
 * consumers from reading heuristic Humanity scores as personhood or send
 * authority. They never participate in generation, selection, or delivery.
 */
const F0_1_HUMANITY_METRIC_SEMANTICS: Record<string, string> = {
  REDUNDANT_PARAPHRASE: 'LEXICAL_REDUNDANCY_HEURISTIC_NOT_SHARED_CONTEXT_AUTHORITY',
  CROSS_TURN_INFORMATION_GAIN: 'CROSS_TURN_DELTA_HEURISTIC_NOT_CURRENT_TURN_GIVEN_NEW_AUTHORITY',
  CURRENT_TURN_VALUE: 'UTILITY_HEURISTIC_NOT_PERSONHOOD_PROOF',
  ROLE_TURN_MANEUVER: 'AUTHORIZED_MANEUVER_OBSERVATION_NOT_PERSONHOOD_PROOF',
  ROLE_BEHAVIOR_ALIGNMENT: 'ROLE_BEHAVIOR_COVERAGE_NOT_PERSONHOOD_PROOF',
  ROLE_VOICE_FIDELITY: 'SURFACE_ROLE_ALIGNMENT_HEURISTIC_NOT_PERSONHOOD_PROOF',
  SPEAKER_CONTINUITY: 'SURFACE_CONTINUITY_HEURISTIC_NOT_RELATIONSHIP_AUTHORITY',
  CONVERSATIONAL_TEXTURE: 'SURFACE_TEXTURE_LINT_NOT_PERSONHOOD_PROOF',
  AI_ANSWER_CADENCE: 'AI_STYLE_CADENCE_LINT_NOT_PERSONHOOD_PROOF',
  ROLE_EVIDENCE: 'STRUCTURAL_ROLE_EVIDENCE_COVERAGE_NOT_PERSONHOOD_SCORE',
};

@Injectable()
export class CustomerServiceRuntimeReplyService {
  private readonly logger = new Logger(CustomerServiceRuntimeReplyService.name);

  constructor(
    private readonly simulation: CustomerServiceSimulationService,
    private readonly requests: CustomerServiceRuntimeReplyRequestRepository,
    private readonly replyTraces: CustomerServiceReplyTracesService,
    private readonly canonicalState: CustomerServiceCanonicalConversationStateService,
  ) {}

  async execute(
    dto: ExecuteCustomerServiceRuntimeReplyDto,
    user: CurrentUserPayload,
    traceContext?: CustomerServiceReplyTraceContext,
    options: CustomerServiceRuntimeReplyExecutionOptions = {},
  ): Promise<CustomerServiceRuntimeReplyEnvelope> {
    const tenantId = resolveRequiredTenantId(user);
    if (dto.strategyVersionIds?.length) {
      throw new BadRequestException('正式运行接口禁止加载未发布策略草稿；请先在 PC 完成回归并发布。');
    }
    const idempotencyKey = dto.idempotencyKey.trim();
    const requestHash = stableJsonHash(runtimeRequestHashInput(dto));
    const processingToken = randomUUID();
    let record = await this.requests.findByKey(tenantId, idempotencyKey);
    if (record) {
      if (record.requestHash !== requestHash) {
        throw new BadRequestException('相同幂等键不能用于不同的客户消息或运行参数');
      }
      if (record.status === 'SUCCEEDED' && record.response) {
        return record.response as CustomerServiceRuntimeReplyEnvelope;
      }
      if (record.status === 'PROCESSING') {
        const staleBefore = new Date(Date.now() - RUNTIME_PROCESSING_LEASE_MS);
        if (!(record.updatedAt instanceof Date) || record.updatedAt >= staleBefore) {
          throw new ConflictException('相同客户消息正在生成回复，请勿重复提交');
        }
        const restarted = await this.requests.restartStaleProcessing(
          record.id,
          tenantId,
          requestHash,
          staleBefore,
          processingToken,
        );
        if (restarted.count !== 1) {
          throw new ConflictException('相同客户消息正在由其他进程恢复');
        }
      } else {
        const restarted = await this.requests.restartFailed(
          record.id,
          tenantId,
          requestHash,
          processingToken,
        );
        if (restarted.count !== 1) {
          throw new ConflictException('相同客户消息的失败请求正在被其他进程恢复');
        }
      }
    } else {
      try {
        record = await this.requests.createProcessing({
          tenantId,
          idempotencyKey,
          requestHash,
          processingToken,
          expiresAt: new Date(Date.now() + resolveIdempotencyRetentionDays() * 86_400_000),
        });
      } catch (error) {
        if (isUniqueConflict(error)) {
          const concurrent = await this.requests.findByKey(tenantId, idempotencyKey);
          if (concurrent?.status === 'SUCCEEDED' && concurrent.response) {
            return concurrent.response as CustomerServiceRuntimeReplyEnvelope;
          }
          throw new ConflictException('相同客户消息正在由其他进程处理');
        }
        throw error;
      }
    }
    if (!record) throw new InternalServerErrorException('运行请求幂等记录创建失败');

    try {
      const canonicalRuntime = await this.canonicalState.prepareRuntime({
        dialogueConversationId: dto.canonicalConversationId,
        expectedRobotId: dto.canonicalRobotId,
        customerMessageClientId: dto.canonicalCustomerMessageClientId,
        dto,
        user,
      });
      const effectiveDto: ExecuteCustomerServiceRuntimeReplyDto = canonicalRuntime
        ? {
            ...dto,
            conversationState: canonicalRuntime.state as unknown as Record<string, unknown>,
            stateRevision: canonicalRuntime.revision,
            variables: {
              ...(dto.variables && typeof dto.variables === 'object' && !Array.isArray(dto.variables)
                ? dto.variables as Record<string, unknown>
                : {}),
              canonicalStateRuntime: {
                currentCustomerApplied: canonicalRuntime.currentCustomerApplied,
                customerEvidenceMessageId: canonicalRuntime.evidence?.id || null,
                stateRevisionAtGeneration: canonicalRuntime.revision,
                stateHashAtGeneration: canonicalRuntime.stateHash,
                rebuildRequired: canonicalRuntime.rebuildRequired,
              },
            },
          }
        : dto;
      const isolatedTestSession = options.allowIsolatedTestSession === true && Boolean(effectiveDto.tuningSessionId);
      const result = await this.simulation.execute({
        ...effectiveDto,
        tuningSessionId: isolatedTestSession ? effectiveDto.tuningSessionId : undefined,
        clientMessageId: isolatedTestSession ? effectiveDto.clientMessageId : undefined,
        generateReply: true,
        hveExecutionLane: isolatedTestSession ? (effectiveDto.hveExecutionLane || 'HVE3_CANDIDATE') : 'HVE_ACTIVE',
      }, user, isolatedTestSession ? { sessionPurpose: 'ROBOT_TEST_DM' } : undefined);
      let canonicalProjection: CustomerServiceCanonicalProjectionResult = {
        status: canonicalRuntime ? 'NO_EVIDENCE' : 'NOT_CANONICAL',
        dialogueConversationId: canonicalRuntime?.dialogueConversationId ?? null,
        revision: canonicalRuntime?.revision ?? null,
        stateHash: canonicalRuntime?.stateHash ?? null,
        evidenceMessageId: canonicalRuntime?.evidence?.id ?? null,
        rebuildRequired: canonicalRuntime?.rebuildRequired ?? false,
      };
      if (canonicalRuntime) {
        try {
          canonicalProjection = await this.canonicalState.commitCustomerProjection({
            runtimeContext: canonicalRuntime,
            dto: effectiveDto,
            understanding: result.understanding,
            user,
          });
        } catch (stateError) {
          this.logger.warn(
            `Canonical Conversation State 保存失败，保留本轮回复：${stateError instanceof Error ? stateError.message : String(stateError)}`,
          );
          canonicalProjection = {
            ...canonicalProjection,
            status: 'CONFLICT',
          };
        }
      }
      let plan = result.generation.deliveryPlan;
      if (!plan?.segments.length) {
        plan = buildCustomerServiceExactSingleDeliveryPlan(
          result.contract,
          result.generation.draft,
          'Runtime 检测到 Delivery Plan 缺失；保留非空冻结正文并原样单气泡投递。',
        );
        if (!plan?.segments.length) {
          // At this point there is genuinely no customer-visible content to preserve.
          throw new InternalServerErrorException('正式运行结果未形成客户可见正文');
        }
        this.logger.warn('Runtime Delivery Plan 缺失，但已有非空模型正文；已保留正文并降级为单气泡，不把 Presentation 故障升级为对话失败');
        result.generation.deliveryPlan = plan;
      }
      const hve3Diagnostics = asRecord(result.generation.hve3);
      const hve3GenerationKernel = asRecord(hve3Diagnostics.kernel);
      const hve3HumanTurn = asRecord(hve3Diagnostics.humanTurnRealization);
      const hve3ModelFacingHumanTurn = asRecord(hve3Diagnostics.modelFacingHumanTurn);
      const hve3Participation = asRecord(hve3HumanTurn.participation);
      const hve3TurnComposition = asRecord(hve3HumanTurn.turnComposition);
      const hve3HumanTurnObservability = projectRobotTestHumanTurnObservability(hve3HumanTurn);
      const hve3HumanityMetricDiagnostics = buildRobotTestHumanityMetricDiagnostics(hve3Diagnostics);
      const hveDecisionIntegrityDiagnostics = projectCustomerServiceDecisionIntegrityDiagnostics(result.contract);
      const hve3RoleCapabilityContext = asRecord(hve3Diagnostics.roleCapabilityContextProjection);
      const hve3ResolvedRoleIdentity = asRecord(hve3Diagnostics.resolvedRoleIdentity);
      const hve3BusinessScope = projectRobotTestBusinessScopeDiagnostics(hve3Diagnostics.businessScope);
      const hve3KnowledgeSelection = projectRobotTestKnowledgeSelectionDiagnostics(hve3Diagnostics.knowledgeSelection);
      const hve3SummarySource = projectRobotTestSummarySourceDiagnostics(hve3Diagnostics.summarySource);
      const hve3CandidateSelection = buildRobotTestCandidateSelectionDiagnostics(hve3Diagnostics);
      const hve3SummaryTransformation = projectSelectedSummaryTransformationDiagnostics(hve3Diagnostics);
      const hve3ControlledDegradation = projectControlledDegradationDiagnostics(hve3Diagnostics.controlledDegradation);
      const canonicalPlanForDiagnostics = result.contract.orchestrationPlan.interactionPlanV2 || null;
      const hve3GroundingAudit = buildRobotTestGroundingAuditDiagnostics({
        hve3: hve3Diagnostics,
        knowledgeSelection: hve3KnowledgeSelection,
        plan: canonicalPlanForDiagnostics,
      });
      const assistantObservationProof = isolatedTestSession
        ? buildRuntimeAssistantObservationProof(result.generation, result.contract)
        : null;
      const hveDeepRecognition = {
        contract: 'DEEP_RECOGNITION_TYPED_PROJECTION_V1',
        authority: 'DIAGNOSTIC_ONLY',
        source: result.understanding.source,
        primaryScenario: result.understanding.primaryScenario,
        primaryIntent: result.understanding.primaryIntent,
        confidence: result.understanding.confidence,
        recognitionModel: {
          attempted: result.understanding.recognitionModel.attempted,
          status: result.understanding.recognitionModel.status,
          model: result.understanding.recognitionModel.model,
          requestId: result.understanding.recognitionModel.requestId,
          elapsedMs: result.understanding.recognitionModel.elapsedMs,
          errorMessage: result.understanding.recognitionModel.errorMessage,
          repairAttempted: result.understanding.recognitionModel.repairAttempted ?? false,
          repairSucceeded: result.understanding.recognitionModel.repairSucceeded ?? false,
          repairRequestId: result.understanding.recognitionModel.repairRequestId ?? null,
          parseError: result.understanding.recognitionModel.parseError ?? null,
          repairParseError: result.understanding.recognitionModel.repairParseError ?? null,
          finishReason: result.understanding.recognitionModel.finishReason ?? null,
          responseLength: result.understanding.recognitionModel.responseLength ?? null,
          recoveryMode: result.understanding.recognitionModel.recoveryMode ?? null,
          fastPathReason: result.understanding.recognitionModel.fastPathReason ?? null,
        },
        humanContext: result.understanding.humanContext,
      };
      const hve3AuthorityRuntime = canonicalPlanForDiagnostics ? {
        internalReviewRequired: Boolean(result.contract.orchestrationPlan.humanReviewRequired),
        publicHandoffRequired: canonicalPlanForDiagnostics.acts.some((item) => item.type === 'REQUEST_HANDOFF' && item.necessity === 'REQUIRED'),
        publicHandoffSources: canonicalPlanForDiagnostics.acts
          .filter((item) => item.type === 'REQUEST_HANDOFF')
          .flatMap((item) => item.sources || [])
          .map((item) => `${item.kind}:${item.refId || '-'}`)
          .slice(0, 12),
        requiredExecutionActs: canonicalPlanForDiagnostics.acts
          .filter((item) => item.type === 'EXECUTE_SERVICE_STEP' && item.necessity === 'REQUIRED')
          .map((item) => ({
            reasonCode: item.reasonCode,
            sources: (item.sources || []).map((source) => `${source.kind}:${source.refId || '-'}`).slice(0, 8),
            grounding: (item.grounding || []).map((grounding) => ({
              source: grounding.source,
              key: grounding.key,
              status: grounding.status,
              evidenceRefs: grounding.evidenceRefs || [],
            })).slice(0, 8),
          }))
          .slice(0, 8),
      } : null;
      const envelope: CustomerServiceRuntimeReplyEnvelope = {
        requestId: record.id,
        idempotencyKey,
        deliveryDecision: result.generation.deliveryDecision,
        segments: plan.segments.map((segment) => ({
          index: segment.index,
          content: segment.content,
          delayBeforeMs: segment.delayBeforeMs,
        })),
        safetyStatus: result.generation.candidateSafetyStatus,
        qualityStatus: result.generation.candidateQualityStatus,
        replySource: result.generation.finalReplySource,
        fallbackUsed: result.generation.fallbackUsed,
        cancelRemainingOnCustomerMessage: plan.cancelRemainingOnCustomerMessage,
        ...(assistantObservationProof ? { assistantObservationProof } : {}),
        ...(dto.includeDiagnostics ? {
          diagnostics: {
            analysisId: readAnalysisId(result.analysisRecord),
            generationStatus: result.generation.status,
            qualityGateStatus: result.quality.status,
            finalFailureReason: result.generation.finalFailureReason,
            modelCallCount: result.generation.modelCallCount,
            rewriteAttemptCount: result.generation.rewriteAttemptCount,
            hveV19Activation: result.hveV19Activation,
            generationKernel: Object.keys(hve3GenerationKernel).length ? hve3GenerationKernel : null,
            deepRecognition: hveDeepRecognition,
            roleParticipation: Object.keys(hve3Participation).length ? hve3Participation : null,
            humanTurnComposition: Object.keys(hve3TurnComposition).length ? hve3TurnComposition : null,
            humanTurnObservability: hve3HumanTurnObservability,
            finalModelFacingHumanTurn: Object.keys(hve3ModelFacingHumanTurn).length ? hve3ModelFacingHumanTurn : null,
            humanityMetricDiagnostics: hve3HumanityMetricDiagnostics,
            decisionIntegrityDiagnostics: hveDecisionIntegrityDiagnostics,
            deliveryPlan: {
              authority: 'PRESENTATION_ONLY',
              mode: plan.mode,
              segmentCount: plan.segments.length,
              cancelRemainingOnCustomerMessage: plan.cancelRemainingOnCustomerMessage,
              boundarySource: plan.boundarySource,
              explicitBreakCount: plan.explicitBreakCount,
              explicitSegmentCount: plan.explicitSegmentCount,
              reason: plan.reason,
              segments: plan.segments.map((segment) => ({
                index: segment.index,
                delayBeforeMs: segment.delayBeforeMs,
                contentLength: [...segment.content].length,
                preview: segment.content.replace(/\s+/g, ' ').trim().slice(0, 160),
              })),
            },
            roleCapabilityContext: Object.keys(hve3RoleCapabilityContext).length ? hve3RoleCapabilityContext : null,
            resolvedRoleIdentity: Object.keys(hve3ResolvedRoleIdentity).length ? hve3ResolvedRoleIdentity : null,
            businessScope: hve3BusinessScope,
            knowledgeSelection: hve3KnowledgeSelection,
            groundingAudit: hve3GroundingAudit,
            summarySource: hve3SummarySource,
            summaryTransformation: hve3SummaryTransformation,
            controlledDegradation: hve3ControlledDegradation,
            authorityRuntime: hve3AuthorityRuntime,
            candidateSelection: hve3CandidateSelection,
            canonicalInteractionPlan: result.contract.orchestrationPlan.interactionPlanV2 ? {
              interactionType: result.contract.orchestrationPlan.interactionPlanV2.interactionType,
              answerObligation: result.contract.orchestrationPlan.interactionPlanV2.answerObligation || null,
              requiredActs: result.contract.orchestrationPlan.interactionPlanV2.acts
                .filter((item) => item.necessity === 'REQUIRED')
                .map((item) => item.type),
              preferredActs: result.contract.orchestrationPlan.interactionPlanV2.acts
                .filter((item) => item.necessity === 'PREFERRED')
                .map((item) => item.type),
              optionalActs: result.contract.orchestrationPlan.interactionPlanV2.acts
                .filter((item) => item.necessity === 'OPTIONAL')
                .map((item) => item.type),
              completion: result.contract.orchestrationPlan.interactionPlanV2.completion.mode,
              rolePolicy: result.contract.orchestrationPlan.interactionPlanV2.diagnostics.roleTurnPolicy ? {
                authority: result.contract.orchestrationPlan.interactionPlanV2.diagnostics.roleTurnPolicy.authority,
                maneuver: result.contract.orchestrationPlan.interactionPlanV2.diagnostics.roleTurnPolicy.maneuver,
                addedActTypes: result.contract.orchestrationPlan.interactionPlanV2.diagnostics.roleTurnPolicy.addedActTypes,
                removedActTypes: result.contract.orchestrationPlan.interactionPlanV2.diagnostics.roleTurnPolicy.removedActTypes,
              } : null,
            } : null,
            canonicalConversationState: {
              previousRevision: canonicalRuntime?.revision ?? null,
              previousStateHash: canonicalRuntime?.stateHash ?? null,
              projectionStatus: canonicalProjection.status,
              revision: canonicalProjection.revision,
              stateHash: canonicalProjection.stateHash,
              evidenceMessageId: canonicalProjection.evidenceMessageId,
              rebuildRequired: canonicalProjection.rebuildRequired,
              currentCustomerApplied: canonicalRuntime?.currentCustomerApplied ?? false,
              stateRevisionAtGeneration: canonicalRuntime?.revision ?? null,
              stateHashAtGeneration: canonicalRuntime?.stateHash ?? null,
            },
          },
        } : {}),
      };
      try {
        const trace = await this.replyTraces.createRuntimeTrace({
          tenantId,
          createdById: user.id,
          runtimeRequestId: record.id,
          dto: effectiveDto,
          context: {
            ...(traceContext ?? defaultTraceContext(effectiveDto)),
            canonicalConversationState: {
              previousRevision: canonicalRuntime?.revision ?? null,
              previousStateHash: canonicalRuntime?.stateHash ?? null,
              projectionStatus: canonicalProjection.status,
              revision: canonicalProjection.revision,
              stateHash: canonicalProjection.stateHash,
              evidenceMessageId: canonicalProjection.evidenceMessageId,
              rebuildRequired: canonicalProjection.rebuildRequired,
              currentCustomerApplied: canonicalRuntime?.currentCustomerApplied ?? false,
              stateRevisionAtGeneration: canonicalRuntime?.revision ?? null,
              stateHashAtGeneration: canonicalRuntime?.stateHash ?? null,
            },
          },
          result,
          segments: envelope.segments,
          qualityStatus: envelope.qualityStatus,
          safetyStatus: envelope.safetyStatus,
          fallbackUsed: envelope.fallbackUsed,
        });
        envelope.replyTraceId = trace.id;
      } catch (traceError) {
        this.logger.error(`Reply Trace 保存失败，保留原运行回复：${traceError instanceof Error ? traceError.message : String(traceError)}`);
      }
      try {
        const completed = await this.requests.complete(
          record.id,
          tenantId,
          processingToken,
          envelope as unknown as Prisma.InputJsonValue,
        );
        if (completed.count !== 1) {
          const winner = await this.requests.findByKey(tenantId, idempotencyKey);
          if (winner?.status === 'SUCCEEDED' && winner.response) {
            return winner.response as CustomerServiceRuntimeReplyEnvelope;
          }
          this.logger.error('幂等结果未能持久化，但 Final Candidate 已生成；保留本轮客户回复并释放失败记录');
          await this.releaseIdempotencyPersistenceFailure(record.id, tenantId, processingToken);
        }
      } catch (persistenceError) {
        // Post-generation persistence is observability/replay infrastructure, never Send Authority.
        // Once a non-empty Final Candidate and Delivery Plan exist, persistence failure cannot turn
        // the customer-visible response into a 500. Best-effort mark the lease failed for retryability.
        this.logger.error(
          `幂等结果保存异常，但 Final Candidate 已生成；保留本轮客户回复：${persistenceError instanceof Error ? persistenceError.message : String(persistenceError)}`,
        );
        await this.releaseIdempotencyPersistenceFailure(record.id, tenantId, processingToken);
      }
      return envelope;
    } catch (error) {
      await this.requests.fail(
        record.id,
        tenantId,
        processingToken,
        error instanceof Error ? error.name : 'RUNTIME_REPLY_FAILED',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private async releaseIdempotencyPersistenceFailure(
    recordId: string,
    tenantId: string,
    processingToken: string,
  ) {
    try {
      await this.requests.fail(
        recordId,
        tenantId,
        processingToken,
        'IDEMPOTENCY_RESULT_PERSISTENCE_DEGRADED',
        'Final Candidate 已返回客户，但幂等结果未能持久化；允许后续显式重试。',
      );
    } catch (releaseError) {
      this.logger.error(
        `幂等失败记录释放也未完成；本轮仍保留客户回复：${releaseError instanceof Error ? releaseError.message : String(releaseError)}`,
      );
    }
  }
}

function buildRuntimeAssistantObservationProof(
  generation: unknown,
  runtimeContract: unknown,
): CustomerServiceRuntimeAssistantObservationProof {
  const generationRecord = asRecord(generation);
  const planFulfillment = resolveCustomerServicePlanFulfillmentFromReplyTrace({
    fallbackUsed: generationRecord.fallbackUsed,
    generationDetails: generation,
    runtimeContract,
  });
  const carriesDeliveredSemanticProof = planFulfillment !== 'NOT_FULFILLED';
  return {
    authority: 'SERVER_RUNTIME_ASSISTANT_OBSERVATION_V1',
    source: 'RUNTIME_EXECUTION_AFTER_CONFORMANCE',
    planFulfillment,
    behaviorPlan: carriesDeliveredSemanticProof
      ? extractCustomerServiceBehaviorPlanFromRuntimeContract(runtimeContract)
      : null,
    interactionPlanV2: carriesDeliveredSemanticProof
      ? extractCustomerServiceInteractionPlanV2FromRuntimeContract(runtimeContract)
      : null,
    realizedGroundingRefs: carriesDeliveredSemanticProof
      ? extractCustomerServiceProvenGroundingRefsFromReplyTrace(generation)
      : [],
    provenGroundedUnits: carriesDeliveredSemanticProof
      ? extractCustomerServiceProvenGroundedUnitsFromReplyTrace(generation)
      : [],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function projectRobotTestHumanTurnObservability(humanTurnValue: unknown) {
  const humanTurn = asRecord(humanTurnValue);
  if (!Object.keys(humanTurn).length) return null;
  const needAlignment = asRecord(humanTurn.needAlignment);
  const conversationReality = asRecord(humanTurn.conversationReality);
  const sharedContext = asRecord(humanTurn.sharedContext);
  const sharedContextConstraints = asRecord(sharedContext.constraints);
  const exchange = asRecord(conversationReality.exchange);
  const continuity = asRecord(conversationReality.continuity);
  const currentFeedback = asRecord(conversationReality.currentFeedback);
  const activeTask = asRecord(conversationReality.activeTask);
  const relevantMemories = Array.isArray(conversationReality.relevantMemories)
    ? conversationReality.relevantMemories.map(asRecord)
    : [];
  const recentSuspendedTasks = Array.isArray(conversationReality.recentSuspendedTasks)
    ? conversationReality.recentSuspendedTasks.map(asRecord)
    : [];
  const recentAssistantMoves = Array.isArray(conversationReality.recentAssistantMoves)
    ? conversationReality.recentAssistantMoves.map(asRecord)
    : [];
  const constraints = asRecord(needAlignment.constraints);
  const turnShape = asRecord(humanTurn.turnShape);
  const surfaceBudget = asRecord(humanTurn.surfaceBudget);
  const antiAiCadence = asRecord(humanTurn.antiAiCadence);
  const adaptation = asRecord(humanTurn.adaptation);
  const texture = asRecord(humanTurn.texture);

  return {
    contract: 'F0_1_HUMAN_TURN_DIAGNOSTICS_V1',
    authority: 'DIAGNOSTIC_ONLY',
    realizationAuthority: typeof humanTurn.authority === 'string' ? humanTurn.authority : null,
    schemaVersion: typeof humanTurn.schemaVersion === 'number' ? humanTurn.schemaVersion : null,
    needAlignment: Object.keys(needAlignment).length ? {
      authority: typeof needAlignment.authority === 'string' ? needAlignment.authority : null,
      primaryContribution: typeof needAlignment.primaryContribution === 'string' ? needAlignment.primaryContribution : null,
      acknowledgementRealization: typeof needAlignment.acknowledgementRealization === 'string' ? needAlignment.acknowledgementRealization : null,
      explanationRole: typeof needAlignment.explanationRole === 'string' ? needAlignment.explanationRole : null,
      openingBias: typeof needAlignment.openingBias === 'string' ? needAlignment.openingBias : null,
      understandingProof: typeof needAlignment.understandingProof === 'string' ? needAlignment.understandingProof : null,
      constraints: {
        preserveAllRequiredActs: constraints.preserveAllRequiredActs === true,
        cannotCreateActs: constraints.cannotCreateActs === true,
        cannotChangeFactsOrPermission: constraints.cannotChangeFactsOrPermission === true,
        noNeedRestatementAsSubstituteForValue: constraints.noNeedRestatementAsSubstituteForValue === true,
      },
    } : null,
    sharedContext: Object.keys(sharedContext).length ? {
      authority: typeof sharedContext.authority === 'string' ? sharedContext.authority : null,
      currentTurnInformation: typeof sharedContext.currentTurnInformation === 'string' ? sharedContext.currentTurnInformation : null,
      priorContext: typeof sharedContext.priorContext === 'string' ? sharedContext.priorContext : null,
      referentialMode: typeof sharedContext.referentialMode === 'string' ? sharedContext.referentialMode : null,
      referenceBasis: typeof sharedContext.referenceBasis === 'string' ? sharedContext.referenceBasis : null,
      newValueStart: typeof sharedContext.newValueStart === 'string' ? sharedContext.newValueStart : null,
      priorContributionStatus: typeof sharedContext.priorContributionStatus === 'string' ? sharedContext.priorContributionStatus : null,
      priorContributionReuse: typeof sharedContext.priorContributionReuse === 'string' ? sharedContext.priorContributionReuse : null,
      avoidEvaluativeReceptionBeforeValue: sharedContext.avoidEvaluativeReceptionBeforeValue === true,
      mustAdvanceBeyondGiven: sharedContext.mustAdvanceBeyondGiven === true,
      constraints: {
        cannotCreateActs: sharedContextConstraints.cannotCreateActs === true,
        cannotChangeFactsOrPermission: sharedContextConstraints.cannotChangeFactsOrPermission === true,
        cannotInventReferents: sharedContextConstraints.cannotInventReferents === true,
        explicitReferenceRequiresSemanticNeed: sharedContextConstraints.explicitReferenceRequiresSemanticNeed === true,
      },
    } : null,
    conversationReality: Object.keys(conversationReality).length ? {
      authority: 'DIAGNOSTIC_ONLY',
      privacyProjection: 'STRUCTURE_ONLY_NO_MEMORY_VALUES_NO_ASSISTANT_EXCERPTS',
      sourceAuthority: typeof conversationReality.authority === 'string' ? conversationReality.authority : null,
      currentTurn: typeof conversationReality.currentTurn === 'number' ? conversationReality.currentTurn : null,
      priorConversationMessages: typeof conversationReality.priorConversationMessages === 'number'
        ? conversationReality.priorConversationMessages
        : null,
      exchange: {
        state: typeof exchange.state === 'string' ? exchange.state : null,
        priorAssistantTurns: typeof exchange.priorAssistantTurns === 'number' ? exchange.priorAssistantTurns : null,
      },
      continuity: {
        lastAssistantMoveAccepted: typeof continuity.lastAssistantMoveAccepted === 'boolean'
          ? continuity.lastAssistantMoveAccepted
          : null,
        lastAssistantMoveRejected: continuity.lastAssistantMoveRejected === true,
        recentRequestedDeltas: Array.isArray(continuity.recentRequestedDeltas)
          ? continuity.recentRequestedDeltas.map((item) => String(item)).slice(0, 12)
          : [],
      },
      currentFeedback: {
        reception: typeof currentFeedback.reception === 'string' ? currentFeedback.reception : null,
        handlingMode: typeof currentFeedback.handlingMode === 'string' ? currentFeedback.handlingMode : null,
        strategyChangeRequired: currentFeedback.strategyChangeRequired === true,
        correctionTarget: typeof currentFeedback.correctionTarget === 'string' ? currentFeedback.correctionTarget : null,
        requestedDeltas: Array.isArray(currentFeedback.requestedDeltas)
          ? currentFeedback.requestedDeltas.map((item) => String(item)).slice(0, 12)
          : [],
      },
      activeTask: Object.keys(activeTask).length ? {
        status: typeof activeTask.status === 'string' ? activeTask.status : null,
        responsibility: typeof activeTask.responsibility === 'string' ? activeTask.responsibility : null,
        createdTurn: typeof activeTask.createdTurn === 'number' ? activeTask.createdTurn : null,
        lastActiveTurn: typeof activeTask.lastActiveTurn === 'number' ? activeTask.lastActiveTurn : null,
        unresolvedGoalCount: Array.isArray(activeTask.unresolvedGoals) ? activeTask.unresolvedGoals.length : 0,
      } : null,
      relevantMemories: relevantMemories.slice(0, 16).map((memory) => ({
        kind: typeof memory.kind === 'string' ? memory.kind : null,
        key: typeof memory.key === 'string' ? memory.key : null,
        sourceTurn: typeof memory.sourceTurn === 'number' ? memory.sourceTurn : null,
        confidence: typeof memory.confidence === 'number' ? memory.confidence : null,
      })),
      recentSuspendedTasks: recentSuspendedTasks.slice(0, 8).map((task) => ({
        status: typeof task.status === 'string' ? task.status : null,
        responsibility: typeof task.responsibility === 'string' ? task.responsibility : null,
        createdTurn: typeof task.createdTurn === 'number' ? task.createdTurn : null,
        lastActiveTurn: typeof task.lastActiveTurn === 'number' ? task.lastActiveTurn : null,
      })),
      recentAssistantMoves: recentAssistantMoves.slice(0, 8).map((move) => ({
        accepted: typeof move.accepted === 'boolean' ? move.accepted : null,
        rejected: move.rejected === true,
        requestedDeltas: Array.isArray(move.requestedDeltas)
          ? move.requestedDeltas.map((item) => String(item)).slice(0, 8)
          : [],
      })),
    } : null,
    turnShape: Object.keys(turnShape).length ? {
      mode: typeof turnShape.mode === 'string' ? turnShape.mode : null,
      preferredBeats: typeof turnShape.preferredBeats === 'number' ? turnShape.preferredBeats : null,
      maxBeats: typeof turnShape.maxBeats === 'number' ? turnShape.maxBeats : null,
      acknowledgement: typeof turnShape.acknowledgement === 'string' ? turnShape.acknowledgement : null,
      questionPlacement: typeof turnShape.questionPlacement === 'string' ? turnShape.questionPlacement : null,
      stopBias: typeof turnShape.stopBias === 'string' ? turnShape.stopBias : null,
    } : null,
    surfaceBudget: Object.keys(surfaceBudget).length ? surfaceBudget : null,
    antiAiCadence: Object.keys(antiAiCadence).length ? antiAiCadence : null,
    texture: Object.keys(texture).length ? texture : null,
    adaptation: Object.keys(adaptation).length ? adaptation : null,
  };
}

function buildRobotTestHumanityMetricDiagnostics(hve3Value: unknown) {
  const hve3 = asRecord(hve3Value);
  const softHumanity = asRecord(hve3.softHumanity);
  if (!Object.keys(softHumanity).length) return null;
  const features = Array.isArray(softHumanity.features) ? softHumanity.features.map(asRecord) : [];
  const roleEvidence = asRecord(softHumanity.roleEvidence);
  const semanticValue = asRecord(softHumanity.semanticValue);
  const selectedCandidateIndex = typeof hve3.selectedCandidateIndex === 'number' ? hve3.selectedCandidateIndex : null;
  const candidates = Array.isArray(hve3.candidates) ? hve3.candidates.map(asRecord) : [];
  const selectedCandidate = selectedCandidateIndex == null
    ? {}
    : candidates.find((candidate) => candidate.index === selectedCandidateIndex) || {};

  const projectFeature = (key: string) => {
    const feature = features.find((item) => item.key === key) || {};
    return {
      key,
      semantics: F0_1_HUMANITY_METRIC_SEMANTICS[key] || 'DIAGNOSTIC_HEURISTIC_NOT_SEND_AUTHORITY',
      score: typeof feature.score === 'number' ? feature.score : null,
      risk: typeof feature.risk === 'string' ? feature.risk : null,
      evidence: Array.isArray(feature.evidence)
        ? feature.evidence.map((item) => String(item)).slice(0, 20)
        : [],
    };
  };

  return {
    contract: 'F0_1_HUMANITY_METRIC_SEMANTICS_V1',
    authority: 'DIAGNOSTIC_ONLY',
    affectsGeneration: false,
    affectsSelectionEligibility: false,
    affectsFinalCandidate: false,
    affectsDelivery: false,
    caution: 'HEURISTIC_SCORES_ARE_NOT_PERSONHOOD_OR_PROMOTION_PROOF',
    selectedCandidateIndex,
    humanRealizationFloor: {
      semantics: 'DIAGNOSTIC_FLOOR_NOT_SEND_AUTHORITY',
      status: typeof selectedCandidate.humanRealizationFloorStatus === 'string'
        ? selectedCandidate.humanRealizationFloorStatus
        : null,
      score: typeof selectedCandidate.humanRealizationFloorScore === 'number'
        ? selectedCandidate.humanRealizationFloorScore
        : null,
      issueKeys: Array.isArray(selectedCandidate.humanRealizationFloorIssueKeys)
        ? selectedCandidate.humanRealizationFloorIssueKeys.map((item) => String(item)).slice(0, 12)
        : [],
    },
    headline: {
      humanityAverageScore: typeof softHumanity.score === 'number' ? softHumanity.score : null,
      pairwiseUtilityScore: typeof softHumanity.pairwiseUtilityScore === 'number' ? softHumanity.pairwiseUtilityScore : null,
      personaPreferenceScore: typeof softHumanity.personaPreferenceScore === 'number' ? softHumanity.personaPreferenceScore : null,
      status: typeof softHumanity.status === 'string' ? softHumanity.status : null,
      highRiskKeys: Array.isArray(softHumanity.highRiskKeys)
        ? softHumanity.highRiskKeys.map((item) => String(item)).slice(0, 20)
        : [],
    },
    roleEvidence: {
      semantics: F0_1_HUMANITY_METRIC_SEMANTICS.ROLE_EVIDENCE,
      status: typeof roleEvidence.status === 'string' ? roleEvidence.status : null,
      score: typeof roleEvidence.score === 'number' ? roleEvidence.score : null,
      positiveEvidence: Array.isArray(roleEvidence.positiveEvidence)
        ? roleEvidence.positiveEvidence.map((item) => String(item)).slice(0, 16)
        : [],
      missingEvidence: Array.isArray(roleEvidence.missingEvidence)
        ? roleEvidence.missingEvidence.map((item) => String(item)).slice(0, 16)
        : [],
      configurationFingerprint: typeof roleEvidence.configurationFingerprint === 'string'
        ? roleEvidence.configurationFingerprint
        : null,
    },
    metrics: [
      'REDUNDANT_PARAPHRASE',
      'CROSS_TURN_INFORMATION_GAIN',
      'CURRENT_TURN_VALUE',
      'ROLE_TURN_MANEUVER',
      'ROLE_BEHAVIOR_ALIGNMENT',
      'ROLE_VOICE_FIDELITY',
      'SPEAKER_CONTINUITY',
      'CONVERSATIONAL_TEXTURE',
      'AI_ANSWER_CADENCE',
    ].map(projectFeature),
    semanticValue: {
      informationGainScore: typeof semanticValue.informationGainScore === 'number' ? semanticValue.informationGainScore : null,
      redundantParaphraseScore: typeof semanticValue.redundantParaphraseScore === 'number' ? semanticValue.redundantParaphraseScore : null,
      crossTurnInformationGainScore: typeof semanticValue.crossTurnInformationGainScore === 'number' ? semanticValue.crossTurnInformationGainScore : null,
      currentTurnValueScore: typeof semanticValue.currentTurnValueScore === 'number' ? semanticValue.currentTurnValueScore : null,
      decisionContributionKind: typeof semanticValue.decisionContributionKind === 'string' ? semanticValue.decisionContributionKind : null,
      decisionContributionScore: typeof semanticValue.decisionContributionScore === 'number' ? semanticValue.decisionContributionScore : null,
    },
  };
}

function projectSelectedSummaryTransformationDiagnostics(hve3Value: unknown) {
  const hve3 = asRecord(hve3Value);
  const candidates = Array.isArray(hve3.candidates) ? hve3.candidates.map(asRecord) : [];
  const selectedIndex = Number.isInteger(hve3.selectedCandidateIndex) ? Number(hve3.selectedCandidateIndex) : -1;
  if (selectedIndex >= 0 && selectedIndex < candidates.length) {
    const projected = projectRobotTestSummaryTransformationDiagnostics(candidates[selectedIndex].summaryTransformation);
    return projected ? { ...projected, candidateIndex: selectedIndex, selected: true } : null;
  }
  // Failure observability: when no candidate is selected, surface the first
  // typed Summary attempt instead of hiding the exact provenance that failed.
  for (let index = 0; index < candidates.length; index += 1) {
    const projected = projectRobotTestSummaryTransformationDiagnostics(candidates[index].summaryTransformation);
    if (projected) return { ...projected, candidateIndex: index, selected: false };
  }
  return null;
}

function projectControlledDegradationDiagnostics(value: unknown) {
  const record = asRecord(value);
  if (!Object.keys(record).length) return null;
  return {
    applied: record.applied === true,
    reason: typeof record.reason === 'string' ? record.reason : null,
    planSatisfied: typeof record.planSatisfied === 'boolean' ? record.planSatisfied : null,
    triggerIssueKeys: Array.isArray(record.triggerIssueKeys)
      ? record.triggerIssueKeys.map((item) => String(item)).slice(0, 16)
      : [],
  };
}

function buildRobotTestCandidateSelectionDiagnostics(hve3: Record<string, unknown>) {
  const candidates = Array.isArray(hve3.candidates) ? hve3.candidates : [];
  const selectedCandidateIndex = typeof hve3.selectedCandidateIndex === 'number' ? hve3.selectedCandidateIndex : null;
  const projectedSource = candidates.slice(0, 7);
  if (selectedCandidateIndex != null) {
    const selected = candidates.find((value) => asRecord(value).index === selectedCandidateIndex);
    if (selected && !projectedSource.some((value) => asRecord(value).index === selectedCandidateIndex)) projectedSource.push(selected);
  }
  const projectedCandidates = projectedSource.map((value) => {
    const candidate = asRecord(value);
    return {
      index: typeof candidate.index === 'number' ? candidate.index : null,
      selected: candidate.selected === true,
      source: typeof candidate.source === 'string' ? candidate.source : null,
      candidateIdentity: projectCandidateIdentity(candidate.candidateIdentity),
      preview: typeof candidate.preview === 'string' ? candidate.preview.slice(0, 180) : null,
      observedActTypes: Array.isArray(candidate.observedActTypes)
        ? candidate.observedActTypes.map((item) => String(item)).slice(0, 16)
        : [],
      qualified: candidate.qualified === true,
      baseQualified: candidate.baseQualified === true || candidate.qualified === true,
      holdValueReady: candidate.holdValueReady === true,
      selectionEligible: candidate.selectionEligible === true,
      selectionIneligibilityReasons: Array.isArray(candidate.selectionIneligibilityReasons)
        ? candidate.selectionIneligibilityReasons.map((item) => String(item)).slice(0, 12)
        : [],
      planStatus: typeof candidate.planStatus === 'string' ? candidate.planStatus : null,
      hardStatus: typeof candidate.hardStatus === 'string' ? candidate.hardStatus : null,
      hardIssueKeys: Array.isArray(candidate.hardIssueKeys)
        ? candidate.hardIssueKeys.map((item) => String(item)).slice(0, 16)
        : [],
      planIssueKeys: Array.isArray(candidate.planIssueKeys)
        ? candidate.planIssueKeys.map((item) => String(item)).slice(0, 16)
        : [],
      planWarningKeys: Array.isArray(candidate.planWarningKeys)
        ? candidate.planWarningKeys.map((item) => String(item)).slice(0, 16)
        : [],
      humanTurnSurfaceStatus: typeof candidate.humanTurnSurfaceStatus === 'string' ? candidate.humanTurnSurfaceStatus : null,
      humanTurnSurfaceIssueKeys: Array.isArray(candidate.humanTurnSurfaceIssueKeys)
        ? candidate.humanTurnSurfaceIssueKeys.map((item) => String(item)).slice(0, 12)
        : [],
      semanticFulfillmentStatus: typeof candidate.semanticFulfillmentStatus === 'string' ? candidate.semanticFulfillmentStatus : null,
      semanticFulfillmentScore: typeof candidate.semanticFulfillmentScore === 'number' ? candidate.semanticFulfillmentScore : null,
      semanticFulfillmentIssueKeys: Array.isArray(candidate.semanticFulfillmentIssueKeys)
        ? candidate.semanticFulfillmentIssueKeys.map((item) => String(item)).slice(0, 12)
        : [],
      semanticFulfillmentWarningKeys: Array.isArray(candidate.semanticFulfillmentWarningKeys)
        ? candidate.semanticFulfillmentWarningKeys.map((item) => String(item)).slice(0, 12)
        : [],
      targetCoverageStatus: typeof candidate.targetCoverageStatus === 'string' ? candidate.targetCoverageStatus : null,
      targetCoverageScore: typeof candidate.targetCoverageScore === 'number' ? candidate.targetCoverageScore : null,
      targetCoverageIssueKeys: Array.isArray(candidate.targetCoverageIssueKeys)
        ? candidate.targetCoverageIssueKeys.map((item) => String(item)).slice(0, 12)
        : [],
      targetCoverageWarningKeys: Array.isArray(candidate.targetCoverageWarningKeys)
        ? candidate.targetCoverageWarningKeys.map((item) => String(item)).slice(0, 12)
        : [],
      humanRealizationFloorStatus: typeof candidate.humanRealizationFloorStatus === 'string' ? candidate.humanRealizationFloorStatus : null,
      humanRealizationFloorScore: typeof candidate.humanRealizationFloorScore === 'number' ? candidate.humanRealizationFloorScore : null,
      humanRealizationFloorIssueKeys: Array.isArray(candidate.humanRealizationFloorIssueKeys)
        ? candidate.humanRealizationFloorIssueKeys.map((item) => String(item)).slice(0, 12)
        : [],
      claimAuthorityStatus: typeof candidate.claimAuthorityStatus === 'string' ? candidate.claimAuthorityStatus : null,
      claimAuthorityIssueKeys: Array.isArray(candidate.claimAuthorityIssueKeys)
        ? candidate.claimAuthorityIssueKeys.map((item) => String(item)).slice(0, 12)
        : [],
      claimAuthorityEvidence: Array.isArray(candidate.claimAuthorityEvidence)
        ? candidate.claimAuthorityEvidence.map((item) => String(item)).slice(0, 24)
        : [],
      structuredSegments: Array.isArray(candidate.structuredSegments)
        ? candidate.structuredSegments.slice(0, 3).map((item) => {
            const segment = asRecord(item);
            return {
              index: typeof segment.index === 'number' ? segment.index : null,
              purposes: Array.isArray(segment.purposes) ? segment.purposes.map((purpose) => String(purpose)).slice(0, 6) : [],
              source: typeof segment.source === 'string' ? segment.source : null,
              plannedActTypes: Array.isArray(segment.plannedActTypes)
                ? segment.plannedActTypes.map((value) => String(value)).slice(0, 12)
                : [],
              allowedGroundingRefs: Array.isArray(segment.allowedGroundingRefs)
                ? segment.allowedGroundingRefs.map((value) => String(value)).slice(0, 16)
                : [],
              provenanceAuthority: typeof segment.provenanceAuthority === 'string' ? segment.provenanceAuthority : null,
              preview: typeof segment.preview === 'string' ? segment.preview.slice(0, 180) : null,
            };
          })
        : [],
      summaryTransformation: projectRobotTestSummaryTransformationDiagnostics(candidate.summaryTransformation),
      naturalnessScore: typeof candidate.naturalnessScore === 'number' ? candidate.naturalnessScore : null,
      personaPreferenceScore: typeof candidate.personaPreferenceScore === 'number' ? candidate.personaPreferenceScore : null,
      crossTurnInformationGainScore: typeof candidate.crossTurnInformationGainScore === 'number' ? candidate.crossTurnInformationGainScore : null,
      roleTurnManeuverScore: typeof candidate.roleTurnManeuverScore === 'number' ? candidate.roleTurnManeuverScore : null,
      roleBehaviorAlignmentScore: typeof candidate.roleBehaviorAlignmentScore === 'number' ? candidate.roleBehaviorAlignmentScore : null,
      roleVoiceFidelityScore: typeof candidate.roleVoiceFidelityScore === 'number' ? candidate.roleVoiceFidelityScore : null,
      speakerContinuityScore: typeof candidate.speakerContinuityScore === 'number' ? candidate.speakerContinuityScore : null,
      conversationalTextureScore: typeof candidate.conversationalTextureScore === 'number' ? candidate.conversationalTextureScore : null,
      aiAnswerCadenceScore: typeof candidate.aiAnswerCadenceScore === 'number' ? candidate.aiAnswerCadenceScore : null,
      roleEvidenceStatus: typeof candidate.roleEvidenceStatus === 'string' ? candidate.roleEvidenceStatus : null,
      roleEvidenceScore: typeof candidate.roleEvidenceScore === 'number' ? candidate.roleEvidenceScore : null,
      positiveRoleEvidence: Array.isArray(candidate.positiveRoleEvidence)
        ? candidate.positiveRoleEvidence.map((item) => String(item)).slice(0, 8)
        : [],
      missingRoleEvidence: Array.isArray(candidate.missingRoleEvidence)
        ? candidate.missingRoleEvidence.map((item) => String(item)).slice(0, 8)
        : [],
    };
  });
  if (!projectedCandidates.length && hve3.selectedCandidateIndex == null && !hve3.selectedReason) return null;
  return {
    selectedCandidateIndex,
    selectedReason: typeof hve3.selectedReason === 'string' ? hve3.selectedReason : null,
    selectedCandidateIdentity: projectCandidateIdentity(hve3.selectedCandidateIdentity),
    finalCandidateInvariant: typeof hve3.finalCandidateInvariant === 'string' ? hve3.finalCandidateInvariant : null,
    candidates: projectedCandidates,
  };
}


function projectRobotTestSummarySourceDiagnostics(value: unknown) {
  const source = asRecord(value);
  const units = Array.isArray(source.sourceUnits) ? source.sourceUnits : [];
  if (source.authority !== 'SERVER_CANONICAL_TRANSCRIPT' && source.transformMode !== 'SOURCE_BOUND_SUMMARY') return null;
  return {
    authority: typeof source.authority === 'string' ? source.authority : null,
    mode: typeof source.mode === 'string' ? source.mode : null,
    transformMode: typeof source.transformMode === 'string' ? source.transformMode : null,
    transcriptSource: typeof source.transcriptSource === 'string' ? source.transcriptSource : null,
    transcriptSourceId: typeof source.transcriptSourceId === 'string' ? source.transcriptSourceId : null,
    transcriptRevision: typeof source.transcriptRevision === 'number' ? source.transcriptRevision : null,
    transcriptFingerprint: typeof source.transcriptFingerprint === 'string' ? source.transcriptFingerprint : null,
    sourceUnitCount: typeof source.sourceUnitCount === 'number' ? source.sourceUnitCount : units.length,
    sourceUnits: units.slice(0, 30).map((value) => {
      const unit = asRecord(value);
      return {
        sourceId: typeof unit.sourceId === 'string' ? unit.sourceId : null,
        sourceIndex: typeof unit.sourceIndex === 'number' ? unit.sourceIndex : null,
        turn: typeof unit.turn === 'number' ? unit.turn : null,
        role: typeof unit.role === 'string' ? unit.role : null,
        preview: typeof unit.preview === 'string' ? unit.preview.slice(0, 180) : null,
      };
    }),
  };
}

function projectRobotTestSummaryTransformationDiagnostics(value: unknown) {
  const transformation = asRecord(value);
  const items = Array.isArray(transformation.items) ? transformation.items : [];
  if (transformation.mode !== 'SOURCE_BOUND_SUMMARY') return null;
  return {
    schemaVersion: typeof transformation.schemaVersion === 'number' ? transformation.schemaVersion : null,
    outputFormat: typeof transformation.outputFormat === 'string' ? transformation.outputFormat : null,
    protocolDetected: transformation.protocolDetected === true,
    protocolValid: transformation.protocolValid === true,
    issueKeys: Array.isArray(transformation.issueKeys)
      ? transformation.issueKeys.map((item) => String(item)).slice(0, 12)
      : [],
    finalTextPreview: typeof transformation.finalTextPreview === 'string'
      ? transformation.finalTextPreview.slice(0, 240)
      : null,
    items: items.slice(0, 12).map((value) => {
      const item = asRecord(value);
      const sources = Array.isArray(item.sources) ? item.sources : [];
      return {
        index: typeof item.index === 'number' ? item.index : null,
        sources: sources.slice(0, 12).map((sourceValue) => {
          const source = asRecord(sourceValue);
          return {
            sourceRef: typeof source.sourceRef === 'string' ? source.sourceRef : null,
            evidenceSpans: Array.isArray(source.evidenceSpans)
              ? source.evidenceSpans.map((span) => String(span)).slice(0, 12)
              : [],
          };
        }),
        summaryTextPreview: typeof item.summaryTextPreview === 'string' ? item.summaryTextPreview.slice(0, 240) : null,
      };
    }),
  };
}

function projectRobotTestBusinessScopeDiagnostics(value: unknown) {
  const scope = asRecord(value);
  if (!scope.fingerprint) return null;
  return {
    schemaVersion: typeof scope.schemaVersion === 'number' ? scope.schemaVersion : null,
    contract: typeof scope.contract === 'string' ? scope.contract : null,
    tenantId: typeof scope.tenantId === 'string' ? scope.tenantId : null,
    merchantRoleId: typeof scope.merchantRoleId === 'string' ? scope.merchantRoleId : null,
    accountProfileId: typeof scope.accountProfileId === 'string' ? scope.accountProfileId : null,
    storeProfileId: typeof scope.storeProfileId === 'string' ? scope.storeProfileId : null,
    industryNodeId: typeof scope.industryNodeId === 'string' ? scope.industryNodeId : null,
    industryCode: typeof scope.industryCode === 'string' ? scope.industryCode : null,
    fingerprint: typeof scope.fingerprint === 'string' ? scope.fingerprint : null,
    evidence: Array.isArray(scope.evidence) ? scope.evidence.map((item) => String(item)).slice(0, 16) : [],
  };
}

function buildRobotTestGroundingAuditDiagnostics(input: {
  hve3: Record<string, unknown>;
  knowledgeSelection: ReturnType<typeof projectRobotTestKnowledgeSelectionDiagnostics>;
  plan: CustomerServiceInteractionPlanV2 | null;
}) {
  const plan = input.plan;
  const selectedKnowledge = (input.knowledgeSelection?.selected || []).map((entry) => ({
    id: entry.id,
    title: entry.title,
    entityType: entry.entityType,
    entityKey: entry.entityKey,
    selectionReason: entry.selectionReason,
    relevanceScore: entry.relevanceScore,
    matchEvidence: entry.matchEvidence,
  }));
  const groundedActs = (plan?.acts || [])
    .filter((act) => Array.isArray(act.grounding) && act.grounding.length > 0)
    .map((act) => ({
      id: act.id || null,
      type: act.type || null,
      necessity: act.necessity || null,
      reasonCode: act.reasonCode || null,
      grounding: (act.grounding || []).map((grounding) => ({
        source: grounding.source || null,
        key: grounding.key || null,
        status: grounding.status || null,
        evidenceRefs: Array.isArray(grounding.evidenceRefs) ? grounding.evidenceRefs.map(String).slice(0, 16) : [],
      })).slice(0, 12),
    })).slice(0, 12);

  const candidates = Array.isArray(input.hve3.candidates) ? input.hve3.candidates.map(asRecord) : [];
  const selectedCandidateIndex = typeof input.hve3.selectedCandidateIndex === 'number' ? input.hve3.selectedCandidateIndex : null;
  const selectedCandidate = selectedCandidateIndex == null
    ? {}
    : candidates.find((candidate) => candidate.index === selectedCandidateIndex) || {};
  const generatedBindings = Array.isArray(selectedCandidate.structuredSegments)
    ? selectedCandidate.structuredSegments.slice(0, 8).map((raw) => {
        const segment = asRecord(raw);
        return {
          index: typeof segment.index === 'number' ? segment.index : null,
          plannedActTypes: Array.isArray(segment.plannedActTypes) ? segment.plannedActTypes.map(String).slice(0, 16) : [],
          allowedGroundingRefs: Array.isArray(segment.allowedGroundingRefs) ? segment.allowedGroundingRefs.map(String).slice(0, 24) : [],
          provenanceAuthority: typeof segment.provenanceAuthority === 'string' ? segment.provenanceAuthority : null,
        };
      })
    : [];

  const conformance = asRecord(input.hve3.semanticConformance);
  const unitChecks = Array.isArray(conformance.unitChecks)
    ? conformance.unitChecks.slice(0, 24).map((raw) => {
        const unit = asRecord(raw);
        const semanticUnitBindings = Array.isArray(unit.semanticUnitBindings)
          ? unit.semanticUnitBindings.slice(0, 16).map((rawBinding) => {
              const binding = asRecord(rawBinding);
              return {
                actId: typeof binding.actId === 'string' ? binding.actId : null,
                actType: typeof binding.actType === 'string' ? binding.actType : null,
                groundingRefs: Array.isArray(binding.groundingRefs) ? binding.groundingRefs.map(String).slice(0, 24) : [],
              };
            })
          : [];
        const semanticSpans = Array.isArray(unit.semanticSpans)
          ? unit.semanticSpans.slice(0, 32).map((rawSpan) => {
              const span = asRecord(rawSpan);
              const classifierResult = asRecord(span.classifierResult);
              const authorizationChecks = asRecord(span.authorizationChecks);
              return {
                atomId: typeof span.atomId === 'string' ? span.atomId : null,
                exactText: typeof span.exactText === 'string' ? span.exactText.slice(0, 500) : null,
                contributionKind: typeof span.contributionKind === 'string' ? span.contributionKind : null,
                semanticTarget: typeof span.semanticTarget === 'string' ? span.semanticTarget : null,
                taskDependency: typeof span.taskDependency === 'string' ? span.taskDependency : null,
                classifierResult: {
                  contributionKind: typeof classifierResult.contributionKind === 'string' ? classifierResult.contributionKind : null,
                  semanticTarget: typeof classifierResult.semanticTarget === 'string' ? classifierResult.semanticTarget : null,
                  taskDependency: typeof classifierResult.taskDependency === 'string' ? classifierResult.taskDependency : null,
                  evidenceRequirement: typeof classifierResult.evidenceRequirement === 'string' ? classifierResult.evidenceRequirement : null,
                  groundingEntailment: typeof classifierResult.groundingEntailment === 'string' ? classifierResult.groundingEntailment : null,
                  groundedActionRole: typeof classifierResult.groundedActionRole === 'string' ? classifierResult.groundedActionRole : null,
                  groundingBasis: typeof classifierResult.groundingBasis === 'string' ? classifierResult.groundingBasis : null,
                  groundingSupport: Array.isArray(classifierResult.groundingSupport)
                    ? classifierResult.groundingSupport.slice(0, 8).map((rawSupport) => {
                        const support = asRecord(rawSupport);
                        return {
                          ref: typeof support.ref === 'string' ? support.ref : null,
                          excerpts: Array.isArray(support.excerpts)
                            ? support.excerpts.map(String).slice(0, 4).map((excerpt) => excerpt.slice(0, 200))
                            : [],
                        };
                      })
                    : [],
                  realizedGroundingRefs: Array.isArray(classifierResult.realizedGroundingRefs)
                    ? classifierResult.realizedGroundingRefs.map(String).slice(0, 24)
                    : [],
                },
                authorizationChecks: {
                  actTypeCompatible: authorizationChecks.actTypeCompatible === true,
                  semanticTargetCompatible: authorizationChecks.semanticTargetCompatible === true,
                  taskDependencyCompatible: authorizationChecks.taskDependencyCompatible === true,
                  groundingCompatible: authorizationChecks.groundingCompatible === true,
                },
                authorized: span.authorized === true,
                realizedActIds: Array.isArray(span.realizedActIds) ? span.realizedActIds.map(String).slice(0, 16) : [],
                realizedGroundingRefs: Array.isArray(span.realizedGroundingRefs) ? span.realizedGroundingRefs.map(String).slice(0, 24) : [],
                violationCode: typeof span.violationCode === 'string' ? span.violationCode : null,
              };
            })
          : [];
        return {
          segmentIndex: typeof unit.segmentIndex === 'number' ? unit.segmentIndex : null,
          unitIndex: typeof unit.unitIndex === 'number' ? unit.unitIndex : null,
          semanticUnitBindings,
          semanticSpans,
          authorized: unit.authorized === true,
          realizedActIds: Array.isArray(unit.realizedActIds) ? unit.realizedActIds.map(String).slice(0, 16) : [],
          realizedGroundingRefs: Array.isArray(unit.realizedGroundingRefs) ? unit.realizedGroundingRefs.map(String).slice(0, 24) : [],
        };
      })
    : [];
  const realizedGroundingRefs = [...new Set(unitChecks.flatMap((unit) => unit.realizedGroundingRefs))].slice(0, 32);
  const allowedGroundingRefs = [...new Set([
    ...groundedActs.flatMap((act) => act.grounding.flatMap((grounding) => grounding.evidenceRefs)),
    ...generatedBindings.flatMap((segment) => segment.allowedGroundingRefs),
  ])].slice(0, 32);

  const responseTarget = plan?.answerObligation?.responseTarget || null;
  const responseEvidence = responseTarget?.evidence || [];
  const typedReferent = responseTarget?.namedOfferingReferent || null;
  const typedResolvedGroundingIds = Array.isArray(typedReferent?.resolvedGroundingIds)
    ? typedReferent!.resolvedGroundingIds.map(String).filter(Boolean)
    : [];
  const resolvedGroundingIds = typedResolvedGroundingIds.length
    ? [...new Set(typedResolvedGroundingIds)]
    : responseEvidence
      .filter((item) => String(item).startsWith('GROUNDING_ENTITY_MATCH:'))
      .map((item) => String(item).slice('GROUNDING_ENTITY_MATCH:'.length))
      .filter(Boolean);
  const exactEntityKnowledge = selectedKnowledge.filter((entry) =>
    entry.matchEvidence.some((item) =>
      item.startsWith('NAMED_OFFERING_EXACT_MATCH:')
      || item.startsWith('NAMED_OFFERING_CORE_EXACT_MATCH:')
      || item.startsWith('ENTITY_KEY_EXACT_MATCH:')));
  const typedReferentStatus = String(typedReferent?.status || '').toUpperCase();
  const entityResolutionStatus = typedReferentStatus === 'UNMATCHED_NAMED_OFFERING'
    ? 'UNMATCHED'
    : typedReferentStatus === 'AMBIGUOUS_EXACT_STRUCTURED_ENTITY'
      ? 'AMBIGUOUS'
      : typedReferentStatus === 'EXACT_STRUCTURED_ENTITY' || resolvedGroundingIds.length
        ? 'RESOLVED'
        : typedReferentStatus === 'PRESENT_UNRESOLVED'
          ? 'UNRESOLVED'
          : responseEvidence.includes('REFERENT_RESOLUTION:UNMATCHED_NAMED_OFFERING')
            ? 'UNMATCHED'
            : responseEvidence.includes('REFERENT_RESOLUTION:AMBIGUOUS_EXACT_STRUCTURED_ENTITY')
              ? 'AMBIGUOUS'
              : responseEvidence.includes('REFERENT:EXPLICIT_NAMED_OFFERING')
                ? 'UNRESOLVED'
                : 'NOT_APPLICABLE';
  const conformanceViolations = Array.isArray(conformance.violations)
    ? conformance.violations.slice(0, 16).map((raw) => {
        const item = asRecord(raw);
        return {
          code: typeof item.code === 'string' ? item.code : null,
          segmentIndex: typeof item.segmentIndex === 'number' ? item.segmentIndex : null,
          unitIndex: typeof item.unitIndex === 'number' ? item.unitIndex : null,
          reason: typeof item.reason === 'string' ? item.reason : null,
        };
      })
    : [];
  const groundingRequired = plan?.answerObligation?.responseTarget?.knowledgeRequirement === 'BUSINESS_FACT_GROUNDING_REQUIRED';
  const groundingClosureStatus = !groundingRequired
    ? 'NOT_REQUIRED'
    : !allowedGroundingRefs.length
      ? 'BOUNDARY_NO_GROUNDING'
      : realizedGroundingRefs.some((ref) => allowedGroundingRefs.includes(ref))
        ? 'PROVEN'
        : 'UNPROVEN';

  return {
    contract: 'R2_2_GROUNDING_PROVENANCE_AUDIT_V2',
    authority: 'DIAGNOSTIC_ONLY',
    affectsGeneration: false,
    affectsSelectionEligibility: false,
    affectsFinalCandidate: false,
    affectsDelivery: false,
    responseTarget: plan?.answerObligation ? {
      evidenceState: plan.answerObligation.evidenceState || null,
      unknownStrategy: plan.answerObligation.unknownStrategy || null,
      knowledgeRequirement: plan.answerObligation.responseTarget?.knowledgeRequirement || null,
      factEvidence: Array.isArray(plan.answerObligation.responseTarget?.evidence)
        ? plan.answerObligation.responseTarget!.evidence!.filter((item) => String(item).startsWith('FACT_')).map(String).slice(0, 12)
        : [],
    } : null,
    entityResolution: {
      status: entityResolutionStatus,
      referent: typedReferent ? {
        status: typedReferent.status,
        source: typedReferent.source,
        surface: typedReferent.surface,
      } : null,
      resolvedGroundingIds,
      exactEntityKnowledge: exactEntityKnowledge.map((entry) => ({
        id: entry.id,
        entityType: entry.entityType,
        entityKey: entry.entityKey,
        title: entry.title,
      })),
    },
    selectedKnowledge,
    groundedActs,
    generatedBindings,
    allowedGroundingRefs,
    groundingClosureStatus,
    conformanceDecision: typeof conformance.decision === 'string' ? conformance.decision : null,
    conformanceObservedDecision: typeof conformance.observedDecision === 'string' ? conformance.observedDecision : null,
    conformanceRemovals: Array.isArray(conformance.removals) ? conformance.removals : [],
    conformanceErrorMessage: typeof conformance.errorMessage === 'string' ? conformance.errorMessage : null,
    conformanceViolations,
    unitChecks,
    realizedGroundingRefs,
  };
}

function projectRobotTestKnowledgeSelectionDiagnostics(value: unknown) {
  const selection = asRecord(value);
  const selected = Array.isArray(selection.selected) ? selection.selected : [];
  const scopeRejected = Array.isArray(selection.scopeRejected) ? selection.scopeRejected : [];
  const budgetEvicted = Array.isArray(selection.budgetEvicted) ? selection.budgetEvicted : [];
  if (!selected.length && !scopeRejected.length && !budgetEvicted.length) return null;
  return {
    selected: selected.slice(0, 12).map((item) => {
      const entry = asRecord(item);
      return {
        id: typeof entry.id === 'string' ? entry.id : null,
        title: typeof entry.title === 'string' ? entry.title : null,
        preview: typeof entry.content === 'string' ? entry.content.slice(0, 220) : null,
        collectionId: typeof entry.collectionId === 'string' ? entry.collectionId : null,
        collectionName: typeof entry.collectionName === 'string' ? entry.collectionName : null,
        collectionIndustryCode: typeof entry.collectionIndustryCode === 'string' ? entry.collectionIndustryCode : null,
        scopeType: typeof entry.scopeType === 'string' ? entry.scopeType : null,
        scopeKey: typeof entry.scopeKey === 'string' ? entry.scopeKey : null,
        entityType: typeof entry.entityType === 'string' ? entry.entityType : null,
        entityKey: typeof entry.entityKey === 'string' ? entry.entityKey : null,
        authorityLevel: typeof entry.authorityLevel === 'string' ? entry.authorityLevel : null,
        bindingPriority: typeof entry.bindingPriority === 'number' ? entry.bindingPriority : null,
        bindingTargetType: typeof entry.bindingTargetType === 'string' ? entry.bindingTargetType : null,
        bindingTargetKey: typeof entry.bindingTargetKey === 'string' ? entry.bindingTargetKey : null,
        scopeCoherence: typeof entry.scopeCoherence === 'string' ? entry.scopeCoherence : null,
        selectionReason: typeof entry.selectionReason === 'string' ? entry.selectionReason : null,
        relevanceScore: typeof entry.relevanceScore === 'number' ? entry.relevanceScore : null,
        matchEvidence: Array.isArray(entry.matchEvidence) ? entry.matchEvidence.map((evidence) => String(evidence)).slice(0, 16) : [],
        estimatedTokens: typeof entry.estimatedTokens === 'number' ? entry.estimatedTokens : null,
      };
    }),
    scopeRejected: scopeRejected.slice(0, 20).map(projectKnowledgeSelectionRejection),
    budgetEvicted: budgetEvicted.slice(0, 20).map(projectKnowledgeSelectionRejection),
  };
}

function projectKnowledgeSelectionRejection(value: unknown) {
  const rejection = asRecord(value);
  return {
    id: typeof rejection.id === 'string' ? rejection.id : null,
    title: typeof rejection.title === 'string' ? rejection.title : null,
    collectionId: typeof rejection.collectionId === 'string' ? rejection.collectionId : null,
    collectionName: typeof rejection.collectionName === 'string' ? rejection.collectionName : null,
    collectionIndustryCode: typeof rejection.collectionIndustryCode === 'string' ? rejection.collectionIndustryCode : null,
    reason: typeof rejection.reason === 'string' ? rejection.reason : null,
  };
}

function projectCandidateIdentity(value: unknown) {
  const identity = asRecord(value);
  if (!identity.lexicalSha256) return null;
  return {
    schemaVersion: typeof identity.schemaVersion === 'number' ? identity.schemaVersion : null,
    authority: typeof identity.authority === 'string' ? identity.authority : null,
    lexicalSha256: String(identity.lexicalSha256),
    structuredSegmentSha256: typeof identity.structuredSegmentSha256 === 'string' ? identity.structuredSegmentSha256 : null,
    segmentCount: typeof identity.segmentCount === 'number' ? identity.segmentCount : null,
    structuredSegmentsAuthoritative: identity.structuredSegmentsAuthoritative === true,
    sealedAtStage: typeof identity.sealedAtStage === 'string' ? identity.sealedAtStage : null,
  };
}

function runtimeRequestHashInput(dto: ExecuteCustomerServiceRuntimeReplyDto) {
  return {
    merchantRoleId: dto.merchantRoleId,
    storeProfileId: dto.storeProfileId || null,
    accountProfileId: dto.accountProfileId || null,
    industryNodeId: dto.industryNodeId || null,
    message: dto.message.trim(),
    scenario: dto.scenario || null,
    intent: dto.intent || null,
    riskLevel: dto.riskLevel || null,
    serviceGoal: dto.serviceGoal || null,
    recognitionSessionId: dto.recognitionSessionId || null,
    canonicalConversationId: dto.canonicalConversationId || null,
    canonicalRobotId: dto.canonicalRobotId || null,
    canonicalCustomerMessageClientId: dto.canonicalCustomerMessageClientId || null,
    conversationHistory: dto.conversationHistory || [],
    conversationState: dto.conversationState || null,
    stateRevision: dto.stateRevision ?? null,
    customerState: dto.customerState || {},
    assetIds: dto.assetIds || [],
    variables: dto.variables || {},
    facts: dto.facts || [],
  };
}

function defaultTraceContext(dto: ExecuteCustomerServiceRuntimeReplyDto): CustomerServiceReplyTraceContext {
  const variables = dto.variables && typeof dto.variables === 'object' && !Array.isArray(dto.variables)
    ? dto.variables as Record<string, unknown>
    : {};
  const channel = String(variables.channel || '').toUpperCase();
  return {
    sourceType: channel === 'DM' ? 'RUNTIME_DM' : channel === 'COMMENT' ? 'RUNTIME_COMMENT' : 'RUNTIME_API',
    channel: channel || undefined,
    platform: typeof variables.platform === 'string' ? variables.platform : undefined,
    postContext: typeof variables.postContext === 'string' ? variables.postContext : undefined,
  };
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function resolveIdempotencyRetentionDays() {
  const configured = Number(
    process.env.CUSTOMER_SERVICE_RUNTIME_IDEMPOTENCY_RETENTION_DAYS
      || DEFAULT_IDEMPOTENCY_RETENTION_DAYS,
  );
  if (!Number.isFinite(configured)) return DEFAULT_IDEMPOTENCY_RETENTION_DAYS;
  return Math.min(365, Math.max(7, Math.trunc(configured)));
}

function readAnalysisId(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = (value as Record<string, unknown>).id;
  return typeof id === 'string' && id ? id : null;
}
