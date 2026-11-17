import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId } from '../../../../common/utils/tenant-scope';
import { PrismaService } from '../../../../prisma/prisma.service';
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
} from '../../../dialogue-records/dialogue-active-context.util';
import { CustomerServiceTuningSessionRepository } from '../../infrastructure/persistence/customer-service-tuning-session.repository';
import {
  reduceCustomerServiceObservedAssistantAction,
  summarizeCustomerServiceConversationState,
  projectCustomerServiceActiveContextBudgetState,
  readCustomerServiceConversationStateV2,
} from '../state/customer-service-conversation-state.reducer';
import {
  extractCustomerServiceBehaviorPlanFromRuntimeContract,
  extractCustomerServiceInteractionPlanV2FromRuntimeContract,
  extractCustomerServiceProvenGroundingRefsFromReplyTrace,
  extractCustomerServiceProvenGroundedUnitsFromReplyTrace,
  resolveCustomerServicePlanFulfillmentFromReplyTrace,
} from '../behavior/customer-service-behavior-memory.util';
import { CustomerServiceSimulationService } from '../simulation/customer-service-simulation.service';
import type { CustomerServiceRuntimeAssistantObservationProof } from '../reply/customer-service-runtime-reply.service';

export const CUSTOMER_SERVICE_ROBOT_TEST_DM_SESSION_PURPOSE = 'ROBOT_TEST_DM' as const;
export const CUSTOMER_SERVICE_ROBOT_TEST_DB_MIGRATION_ERROR_CODE = 'CUSTOMER_SERVICE_ROBOT_TEST_DB_MIGRATION_REQUIRED' as const;
export const CUSTOMER_SERVICE_ROBOT_TEST_DB_MIGRATION = '20260807192500_add_customer_service_robot_test_session_purpose' as const;
const C5E_TEST_CONTEXT_CANDIDATE_LIMIT = 400;

type RobotTestDmSession = Awaited<ReturnType<CustomerServiceTuningSessionRepository['findScoped']>> extends infer T
  ? Exclude<T, null>
  : never;

export type CustomerServiceRobotTestActiveContext = {
  sessionId: string;
  stateRevision: number;
  currentMessageAlreadyCommitted: boolean;
  history: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
  window: Record<string, unknown>;
};

@Injectable()
export class CustomerServiceRobotTestDmSessionService {
  private readonly logger = new Logger(CustomerServiceRobotTestDmSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: CustomerServiceTuningSessionRepository,
    private readonly simulation: CustomerServiceSimulationService,
  ) {}

  async prepare(input: {
    testSessionId?: string;
    robotId?: string;
    accountProfileId: string;
    currentMessage: string;
    currentClientMessageId?: string;
    tokenBudget?: number;
    user: CurrentUserPayload;
  }): Promise<CustomerServiceRobotTestActiveContext> {
    const tenantId = resolveRequiredTenantId(input.user);
    let session: RobotTestDmSession;
    try {
      session = await this.resolveOrCreateSession({ ...input, tenantId });
    } catch (error) {
      if (isPrismaSchemaReadinessError(error)) {
        throw new ServiceUnavailableException({
          message: '机器人测试数据库结构尚未更新，请先执行 Core 的 Prisma migration 后重试',
          data: {
            errorCode: CUSTOMER_SERVICE_ROBOT_TEST_DB_MIGRATION_ERROR_CODE,
            migration: CUSTOMER_SERVICE_ROBOT_TEST_DB_MIGRATION,
            command: 'pnpm run prisma:deploy',
          },
        });
      }
      throw error;
    }
    const snapshot = asRecord(session.contextSnapshot);
    const state = readCustomerServiceConversationStateV2(snapshot.conversationStateV2);
    const existingCurrentMessage = input.currentClientMessageId
      ? await this.sessions.findMessageByClientId(session.id, tenantId, input.currentClientMessageId)
      : null;
    if (existingCurrentMessage && String(existingCurrentMessage.content || '').trim() !== String(input.currentMessage || '').trim()) {
      throw new BadRequestException('同一测试消息 ID 不能用于不同内容，请重新发送该测试消息');
    }
    const stateSummary = summarizeCustomerServiceConversationState(state, String(input.currentMessage || '').trim());
    const activeContextState = projectCustomerServiceActiveContextBudgetState(state, String(input.currentMessage || '').trim());
    const evidenceIds = extractConversationStateEvidenceMessageIds(state);
    const messages = await this.sessions.listMessages(session.id, tenantId, C5E_TEST_CONTEXT_CANDIDATE_LIMIT);
    const evidenceMessages = evidenceIds.length
      ? await this.sessions.listMessagesByIds(session.id, tenantId, evidenceIds)
      : [];
    const currentClientMessageId = String(input.currentClientMessageId || '').trim();
    const currentAssistantPrefix = currentClientMessageId ? `${currentClientMessageId}:assistant:` : '';
    const rows = uniqueDialogueRowsById([...messages, ...evidenceMessages].map((item) => ({
      id: item.id,
      clientMessageId: item.clientMessageId,
      senderRole: item.role === 'ASSISTANT' ? 'account' : 'user',
      textContent: String(item.content || '').trim(),
      turnNo: item.turnNo,
    })).filter((item) => Boolean(item.textContent)))
      .filter((item) => !existingCurrentMessage || (
        String(item.clientMessageId || '') !== currentClientMessageId
        && (!currentAssistantPrefix || !String(item.clientMessageId || '').startsWith(currentAssistantPrefix))
      ))
      .sort((a, b) => Number(a.turnNo || 0) - Number(b.turnNo || 0));
    const logicalRows = coalesceDialogueActiveContextRows(rows);
    const budget = Math.max(
      DIALOGUE_ACTIVE_CONTEXT_MIN_TOKEN_BUDGET,
      Math.min(
        DIALOGUE_ACTIVE_CONTEXT_MAX_TOKEN_BUDGET,
        Math.trunc(Number(input.tokenBudget) || DIALOGUE_ACTIVE_CONTEXT_DEFAULT_TOKEN_BUDGET),
      ),
    );
    const estimatedCurrentMessageTokens = estimateDialogueContextTextTokens(input.currentMessage) + (input.currentMessage ? 6 : 0);
    const estimatedInternalStateTokens = estimateDialogueContextJsonTokens(stateSummary);
    const estimatedStateTokens = estimateDialogueContextJsonTokens(activeContextState);
    const historyTokenBudget = Math.max(0, budget - estimatedCurrentMessageTokens - estimatedStateTokens);
    const selection = selectDialogueActiveContextRows({
      effectiveRows: logicalRows,
      evidenceIds,
      historyTokenBudget,
      candidateComplete: Number(session.messageCount || 0) <= C5E_TEST_CONTEXT_CANDIDATE_LIMIT,
      recentTokenRatio: DIALOGUE_ACTIVE_CONTEXT_RECENT_TOKEN_RATIO,
    });
    const history = selection.selectedRows.map((item) => ({
      role: item.senderRole === 'account' ? 'ASSISTANT' as const : 'CUSTOMER' as const,
      content: item.textContent,
    }));
    const estimatedHistoryTokens = selection.estimatedHistoryTokens;
    return {
      sessionId: session.id,
      stateRevision: Number(session.stateRevision || 0),
      currentMessageAlreadyCommitted: Boolean(existingCurrentMessage),
      history,
      window: {
        budgetApplied: true,
        selectionMode: selection.selectionMode,
        tokenBudget: budget,
        estimatedTokens: estimatedCurrentMessageTokens + estimatedStateTokens + estimatedHistoryTokens,
        estimatedCurrentMessageTokens,
        estimatedStateTokens,
        estimatedHistoryTokens,
        historyTokenBudget,
        allHistoryIncluded: selection.allHistoryIncluded,
        selectedMessageCount: selection.selectedRows.length,
        candidateMessageCount: logicalRows.length + (Number(session.messageCount || 0) > C5E_TEST_CONTEXT_CANDIDATE_LIMIT ? 1 : 0),
        physicalMessageCount: rows.length + (Number(session.messageCount || 0) > C5E_TEST_CONTEXT_CANDIDATE_LIMIT ? 1 : 0),
        estimatedInternalStateTokens,
        stateProjection: 'GENERATION_RELEVANT_BUDGET_V1',
        evidenceRecallCount: selection.evidenceRecallCount,
        sourceConversationIds: [],
        sourceConversationCount: 0,
        source: 'ROBOT_TEST_SESSION',
        testSessionId: session.id,
        stateRevision: Number(session.stateRevision || 0),
      },
    };
  }

  async appendAssistantSegments(input: {
    sessionId: string;
    replyGroupId: string;
    segments: Array<{ content: string }>;
    replyTraceId?: string | null;
    replyAttemptId?: string | null;
    assistantObservationProof?: CustomerServiceRuntimeAssistantObservationProof | null;
    user: CurrentUserPayload;
  }) {
    const tenantId = resolveRequiredTenantId(input.user);
    const session = await this.requireRobotTestSession(input.sessionId, tenantId, input.user.id);
    const appended = [];
    for (let index = 0; index < input.segments.length; index += 1) {
      const content = String(input.segments[index]?.content || '').trim();
      if (!content) continue;
      const item = await this.sessions.appendMessage({
        sessionId: session.id,
        tenantId,
        role: 'ASSISTANT',
        content,
        clientMessageId: `${input.replyGroupId}:assistant:${index}`.slice(0, 120),
      });
      if (item) appended.push(item);
    }
    if (appended.length) {
      try {
        await this.commitObservedAssistantBehavior({
          session,
          tenantId,
          assistantText: appended.map((item) => String(item.content || '').trim()).filter(Boolean).join('\n'),
          evidenceMessageIds: appended.map((item) => String(item.id || '')).filter(Boolean),
          replyTraceId: input.replyTraceId,
          replyAttemptId: input.replyAttemptId || `robot-test:${input.replyGroupId}`,
          assistantObservationProof: input.assistantObservationProof,
        });
      } catch (error) {
        this.logger.warn(`Robot Test assistant 消息已保存，但行为记忆提交失败；保留消息并等待后续会话继续：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return appended;
  }

  private async commitObservedAssistantBehavior(input: {
    session: RobotTestDmSession;
    tenantId: string;
    assistantText: string;
    evidenceMessageIds: string[];
    replyTraceId?: string | null;
    replyAttemptId?: string | null;
    assistantObservationProof?: CustomerServiceRuntimeAssistantObservationProof | null;
  }) {
    const replyTraceId = String(input.replyTraceId || '').trim();
    const replyAttemptId = String(input.replyAttemptId || '').trim();
    let behaviorPlan: unknown = null;
    let interactionPlanV2: unknown = null;
    let planFulfillment: 'FULFILLED' | 'NOT_FULFILLED' | 'UNKNOWN' = 'UNKNOWN';
    let realizedGroundingRefs: string[] = [];
    let provenGroundedUnits: ReturnType<typeof extractCustomerServiceProvenGroundedUnitsFromReplyTrace> = [];
    const runtimeProof = normalizeRuntimeAssistantObservationProof(input.assistantObservationProof);
    if (runtimeProof) {
      planFulfillment = runtimeProof.planFulfillment;
      realizedGroundingRefs = runtimeProof.realizedGroundingRefs;
      provenGroundedUnits = runtimeProof.provenGroundedUnits;
      if (planFulfillment !== 'NOT_FULFILLED') {
        behaviorPlan = runtimeProof.behaviorPlan;
        interactionPlanV2 = runtimeProof.interactionPlanV2;
      }
    } else {
      try {
        // Compatibility fallback for older/idempotent Robot Test results that do not yet
        // carry the server-owned in-memory observation proof. Trace persistence is not the
        // primary transport because a successful customer reply must not lose next-turn
        // Grounding solely because observability storage/lookup was delayed or unavailable.
        const trace = replyTraceId
          ? await (this.prisma as any).customerServiceReplyTrace.findFirst({
              where: { id: replyTraceId, tenantId: input.tenantId },
              select: { runtimeContract: true, generationDetails: true, fallbackUsed: true },
            })
          : replyAttemptId
            ? await (this.prisma as any).customerServiceReplyTrace.findFirst({
                where: { tenantId: input.tenantId, replyAttemptId },
                orderBy: [{ createdAt: 'desc' }],
                select: { runtimeContract: true, generationDetails: true, fallbackUsed: true },
              })
            : null;
        realizedGroundingRefs = extractCustomerServiceProvenGroundingRefsFromReplyTrace(trace?.generationDetails);
        provenGroundedUnits = extractCustomerServiceProvenGroundedUnitsFromReplyTrace(trace?.generationDetails);
        planFulfillment = resolveCustomerServicePlanFulfillmentFromReplyTrace({
          fallbackUsed: trace?.fallbackUsed,
          generationDetails: trace?.generationDetails,
          runtimeContract: trace?.runtimeContract,
        });
        if (planFulfillment !== 'NOT_FULFILLED') {
          behaviorPlan = extractCustomerServiceBehaviorPlanFromRuntimeContract(trace?.runtimeContract);
          interactionPlanV2 = extractCustomerServiceInteractionPlanV2FromRuntimeContract(trace?.runtimeContract);
        }
      } catch (error) {
        this.logger.warn(`Robot Test 读取 Reply Trace 行为上下文失败，降级为已保存文本启发式：${error instanceof Error ? error.message : String(error)}`);
      }
    }

    let current: RobotTestDmSession | null = input.session;
    for (let attempt = 0; attempt < 2 && current; attempt += 1) {
      const snapshot = asRecord(current.contextSnapshot);
      const previousState = readCustomerServiceConversationStateV2(snapshot.conversationStateV2);
      const nextState = reduceCustomerServiceObservedAssistantAction({
        previous: previousState,
        assistantText: input.assistantText,
        evidenceMessageIds: input.evidenceMessageIds,
        replyTraceId,
        replyAttemptId,
        behaviorPlan,
        interactionPlanV2,
        planFulfillment,
        realizedGroundingRefs,
        provenGroundedUnits,
      });
      if (nextState.revision === previousState.revision) return;
      const nextSnapshot = {
        ...snapshot,
        conversationStateV2: nextState,
      };
      const updated = await this.sessions.updateConversationStateScoped({
        id: current.id,
        tenantId: input.tenantId,
        expectedRevision: Number(current.stateRevision || 0),
        stateSchemaVersion: nextState.schemaVersion,
        contextPayloadBytes: Buffer.byteLength(JSON.stringify(nextSnapshot), 'utf8'),
        contextSnapshot: nextSnapshot as Prisma.InputJsonValue,
      });
      if (updated) return;
      current = await this.sessions.findScoped(current.id, input.tenantId);
    }
    this.logger.warn(`Robot Test assistant 行为记忆 CAS 冲突，已保存消息但未覆盖较新的 State：session=${input.session.id}`);
  }

  async advanceWithoutReply(input: {
    sessionId: string;
    clientMessageId: string;
    message: string;
    conversationHistory: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
    activeContextWindow: Record<string, unknown>;
    assetIds?: string[];
    user: CurrentUserPayload;
  }) {
    const tenantId = resolveRequiredTenantId(input.user);
    const session = await this.requireRobotTestSession(input.sessionId, tenantId, input.user.id);
    await this.simulation.execute({
      merchantRoleId: session.merchantRoleId,
      accountProfileId: session.accountProfileId || undefined,
      industryNodeId: session.industryNodeId || undefined,
      tuningSessionId: session.id,
      recognitionSessionId: session.id,
      clientMessageId: input.clientMessageId,
      message: input.message,
      conversationHistory: input.conversationHistory,
      assetIds: input.assetIds,
      variables: {
        activeContextWindow: input.activeContextWindow,
        robotTestSession: {
          purpose: CUSTOMER_SERVICE_ROBOT_TEST_DM_SESSION_PURPOSE,
          id: session.id,
        },
      },
      generateReply: false,
    }, input.user, { sessionPurpose: CUSTOMER_SERVICE_ROBOT_TEST_DM_SESSION_PURPOSE });
  }

  private async resolveOrCreateSession(input: {
    testSessionId?: string;
    robotId?: string;
    accountProfileId: string;
    tenantId: string;
    user: CurrentUserPayload;
  }): Promise<RobotTestDmSession> {
    const account = await this.prisma.customerServiceAccountProfile.findFirst({
      where: {
        id: input.accountProfileId,
        tenantId: input.tenantId,
        status: 'ENABLED',
        deletedAt: null,
      },
      include: {
        merchantRole: { select: { id: true, status: true } },
        storeProfile: { select: { id: true, status: true } },
        industryNode: { select: { id: true } },
      },
    });
    if (!account) throw new NotFoundException('机器人测试绑定的账号背景不存在、未启用或不属于当前租户');
    if (!account.merchantRoleId || !account.merchantRole || account.merchantRole.status !== 'ENABLED') {
      throw new BadRequestException('机器人测试绑定的账号背景必须关联启用中的客服角色');
    }
    if (account.storeProfileId && account.storeProfile?.status !== 'ENABLED') {
      throw new BadRequestException('机器人测试绑定的店铺背景未启用');
    }

    const requestedId = String(input.testSessionId || '').trim();
    if (requestedId) {
      const existing = await this.requireRobotTestSession(requestedId, input.tenantId, input.user.id);
      const snapshot = asRecord(existing.contextSnapshot);
      const variables = asRecord(snapshot.variables);
      const robotTestMeta = asRecord(variables.robotTestSession);
      const existingRobotId = String(snapshot.robotId || robotTestMeta.robotId || '').trim();
      if (existing.accountProfileId !== account.id || (existingRobotId && existingRobotId !== String(input.robotId || '').trim())) {
        throw new BadRequestException('机器人测试会话的机器人或账号范围已变化，请清空测试对话后重试');
      }
      return existing;
    }

    return this.sessions.create({
      tenantId: input.tenantId,
      merchantRoleId: account.merchantRoleId,
      industryNodeId: account.industryNodeId || null,
      accountProfileId: account.id,
      title: `Robot Test DM · ${String(account.name || account.id).slice(0, 96)}`,
      purpose: CUSTOMER_SERVICE_ROBOT_TEST_DM_SESSION_PURPOSE,
      createdById: input.user.id,
      contextSnapshot: {
        sessionPurpose: CUSTOMER_SERVICE_ROBOT_TEST_DM_SESSION_PURPOSE,
        robotId: String(input.robotId || '').trim() || null,
        merchantRoleId: account.merchantRoleId,
        accountProfileId: account.id,
        storeProfileId: account.storeProfileId || null,
        industryNodeId: account.industryNodeId || null,
        classificationMode: 'AUTO',
      } as Prisma.InputJsonValue,
    }) as Promise<RobotTestDmSession>;
  }

  private async requireRobotTestSession(id: string, tenantId: string, userId: string): Promise<RobotTestDmSession> {
    const session = await this.sessions.findScoped(id, tenantId);
    if (!session || session.purpose !== CUSTOMER_SERVICE_ROBOT_TEST_DM_SESSION_PURPOSE || session.createdById !== userId) {
      throw new NotFoundException('机器人测试会话不存在或不属于当前用户');
    }
    if (session.status !== 'ACTIVE') throw new BadRequestException('机器人测试会话已归档，请清空测试对话后重新开始');
    return session as RobotTestDmSession;
  }
}

function normalizeRuntimeAssistantObservationProof(
  value: unknown,
): CustomerServiceRuntimeAssistantObservationProof | null {
  const record = asRecord(value);
  if (record.authority !== 'SERVER_RUNTIME_ASSISTANT_OBSERVATION_V1'
    || record.source !== 'RUNTIME_EXECUTION_AFTER_CONFORMANCE') return null;
  const planFulfillment = ['FULFILLED', 'NOT_FULFILLED', 'UNKNOWN'].includes(String(record.planFulfillment))
    ? record.planFulfillment as CustomerServiceRuntimeAssistantObservationProof['planFulfillment']
    : null;
  if (!planFulfillment) return null;
  const realizedGroundingRefs = [...new Set((Array.isArray(record.realizedGroundingRefs) ? record.realizedGroundingRefs : [])
    .map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 32);
  const provenGroundedUnits = (Array.isArray(record.provenGroundedUnits) ? record.provenGroundedUnits : [])
    .slice(0, 24)
    .map(asRecord)
    .map((unit) => ({
      text: String(unit.text || '').trim().slice(0, 2000),
      groundingRefs: [...new Set((Array.isArray(unit.groundingRefs) ? unit.groundingRefs : [])
        .map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 32),
    }))
    .filter((unit) => unit.text && unit.groundingRefs.length > 0);
  const carriesDeliveredSemanticProof = planFulfillment !== 'NOT_FULFILLED';
  return {
    authority: 'SERVER_RUNTIME_ASSISTANT_OBSERVATION_V1',
    source: 'RUNTIME_EXECUTION_AFTER_CONFORMANCE',
    planFulfillment,
    behaviorPlan: carriesDeliveredSemanticProof ? record.behaviorPlan : null,
    interactionPlanV2: carriesDeliveredSemanticProof ? record.interactionPlanV2 : null,
    realizedGroundingRefs: carriesDeliveredSemanticProof ? realizedGroundingRefs : [],
    provenGroundedUnits: carriesDeliveredSemanticProof ? provenGroundedUnits : [],
  };
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}
function isPrismaSchemaReadinessError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as { code?: unknown }).code || '').trim();
  return code === 'P2021' || code === 'P2022';
}

