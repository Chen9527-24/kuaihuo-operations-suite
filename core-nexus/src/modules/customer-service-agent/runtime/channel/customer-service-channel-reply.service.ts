import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId } from '../../../../common/utils/tenant-scope';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CustomerServiceModelGateway } from '../../infrastructure/model-gateway/customer-service-model-gateway.service';
import {
  CustomerServiceRuntimeReplyService,
  type CustomerServiceRuntimeAssistantObservationProof,
} from '../reply/customer-service-runtime-reply.service';
import { CustomerServiceReplyTracesService, CustomerServiceReplyTraceSourceType } from '../../admin/reply-traces/customer-service-reply-traces.service';
import { CustomerServiceKnowledgeEntriesService } from '../../admin/knowledge-entries/customer-service-knowledge-entries.service';

export type CustomerServiceChannel = 'COMMENT' | 'DM';

export type CustomerServiceChannelReplyInput = {
  channel: CustomerServiceChannel;
  robotId?: string;
  accountProfileId: string;
  message: string;
  messageId?: string;
  platform?: string;
  postContext?: string;
  serviceGoal?: string;
  recognitionSessionId?: string;
  canonicalConversationId?: string;
  canonicalCustomerMessageClientId?: string;
  isolatedTestSessionId?: string;
  isolatedTestClientMessageId?: string;
  /** PC Robot Test only. Formal production runtime remains locked by RuntimeReplyService. */
  hveExecutionLane?: 'HVE3_CANDIDATE' | 'HVE_ACTIVE';
  conversationHistory?: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
  assetIds?: string[];
  variables?: Record<string, unknown>;
  sourceType?: CustomerServiceReplyTraceSourceType;
  sourceRefId?: string;
  conversationId?: string;
  commentThreadId?: string;
  customerMessageId?: string;
  replyMessageId?: string;
  replyAttemptId?: string;
};

export type CustomerServiceChannelReplyResult = {
  provider: 'DEEPSEEK' | 'FIXED_QA';
  action: 'SEND' | 'SKIP' | 'HANDOFF';
  shouldReply: boolean;
  skipReply: boolean;
  skipReason: string;
  messageType: string;
  intentLevel: string;
  riskLevel: string;
  judgeReason: string;
  segments: Array<{ index: number; content: string; delayBeforeMs: number }>;
  replySource: string;
  qualityStatus: string;
  safetyStatus: string;
  fallbackUsed: boolean;
  cancelRemainingOnCustomerMessage: boolean;
  replyTraceId?: string;
  diagnostics?: Record<string, unknown>;
  /** Internal Robot Test state transport; never used as customer-visible Send Authority. */
  assistantObservationProof?: CustomerServiceRuntimeAssistantObservationProof;
};

type AdmissionDecision = {
  action: 'SEND' | 'SKIP' | 'HANDOFF';
  messageType: string;
  intentLevel: string;
  riskLevel: string;
  reason: string;
  model: string | null;
  requestId: string | null;
};

@Injectable()
export class CustomerServiceChannelReplyService {
  private readonly logger = new Logger(CustomerServiceChannelReplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly modelGateway: CustomerServiceModelGateway,
    private readonly runtimeReplyService: CustomerServiceRuntimeReplyService,
    private readonly replyTraces: CustomerServiceReplyTracesService,
    private readonly knowledgeEntries: CustomerServiceKnowledgeEntriesService,
  ) {}

  async execute(
    input: CustomerServiceChannelReplyInput,
    user: CurrentUserPayload,
  ): Promise<CustomerServiceChannelReplyResult> {
    const tenantId = resolveRequiredTenantId(user);
    const message = String(input.message || '').trim();
    const accountProfileId = String(input.accountProfileId || '').trim();
    if (!message) throw new BadRequestException('Customer message is required');
    if (!accountProfileId) throw new BadRequestException('A DeepSeek robot must bind an account profile');

    const account = await this.prisma.customerServiceAccountProfile.findFirst({
      where: { id: accountProfileId, tenantId, status: 'ENABLED', deletedAt: null },
      include: {
        storeProfile: true,
        merchantRole: true,
        industryNode: true,
      },
    });
    if (!account) {
      throw new NotFoundException('The bound account profile is missing, disabled, or outside the current tenant');
    }
    if (!account.merchantRoleId || !account.merchantRole || account.merchantRole.status !== 'ENABLED') {
      throw new BadRequestException('The bound account profile must reference an enabled customer-service role');
    }

    // Fixed QA is already scoped by the selected account/store/role Knowledge applicability.
    // Preflight it before COMMENT admission so a deterministic configured answer never pays
    // for, or depends on, an unrelated admission model call. Runtime resolves it again as
    // the final reply authority; this preflight only decides whether admission AI is needed.
    const fixedQaPrecheck = await this.knowledgeEntries.resolveFixedQaForRuntime({
      tenantId,
      accountProfileId: account.id,
      storeProfileId: account.storeProfileId || undefined,
      merchantRoleId: account.merchantRoleId,
      message,
    });
    const decision: AdmissionDecision = fixedQaPrecheck
      ? {
          action: 'SEND',
          messageType: 'fixed_qa',
          intentLevel: 'high',
          riskLevel: 'LOW',
          reason: '命中当前账号/店铺/客服身份可用的固定问答，直接进入确定性回复。',
          model: null,
          requestId: null,
        }
      : await this.decideAdmission(input, {
          accountName: account.name,
          accountProfile: account.profile,
          storeProfile: account.storeProfile?.profile ?? null,
        });
    if (decision.action !== 'SEND') {
      let replyTraceId: string | undefined;
      try {
        const trace = await this.replyTraces.createDecisionTrace({
          tenantId,
          createdById: user.id,
          context: buildTraceContext(input),
          customerMessage: message,
          accountProfileId: account.id,
          storeProfileId: account.storeProfileId || undefined,
          merchantRoleId: account.merchantRoleId || undefined,
          industryNodeId: account.industryNodeId || undefined,
          action: decision.action,
          decision,
          model: decision.model || undefined,
          configurationHash: buildAdmissionConfigurationHash(account, input),
          sourceRevisions: {
            admissionPolicy: 1,
            accountProfile: { id: account.id, revision: account.revision },
            storeProfile: account.storeProfile ? { id: account.storeProfile.id, revision: account.storeProfile.revision } : null,
            merchantRole: account.merchantRole ? { id: account.merchantRole.id, revision: account.merchantRole.revision } : null,
            industryNode: account.industryNode ? { id: account.industryNode.id, revision: account.industryNode.revision } : null,
          },
        });
        replyTraceId = trace.id;
      } catch (traceError) {
        this.logger.error(`决策 Reply Trace 保存失败，保留原判断结果：${traceError instanceof Error ? traceError.message : String(traceError)}`);
      }
      return {
        provider: 'DEEPSEEK',
        action: decision.action,
        shouldReply: false,
        skipReply: decision.action === 'SKIP',
        skipReason: decision.reason,
        messageType: decision.messageType,
        intentLevel: decision.intentLevel,
        riskLevel: decision.riskLevel,
        judgeReason: decision.reason,
        segments: [],
        replySource: decision.action === 'HANDOFF' ? 'HUMAN_HANDOFF' : 'ADMISSION_SKIP',
        qualityStatus: 'NOT_RUN',
        safetyStatus: decision.action === 'HANDOFF' ? 'BLOCKED' : 'NOT_RUN',
        fallbackUsed: false,
        cancelRemainingOnCustomerMessage: true,
        replyTraceId,
      };
    }

    const history = normalizeHistory(input.conversationHistory, hasBudgetSelectedActiveContext(input.variables));
    const idempotencyKey = buildIdempotencyKey(tenantId, input, history);
    const result = await this.runtimeReplyService.execute({
      merchantRoleId: account.merchantRoleId,
      storeProfileId: account.storeProfileId || undefined,
      accountProfileId: account.id,
      industryNodeId: account.industryNodeId || undefined,
      message,
      serviceGoal: input.serviceGoal,
      recognitionSessionId: input.recognitionSessionId,
      canonicalConversationId: input.canonicalConversationId,
      canonicalRobotId: input.canonicalConversationId ? input.robotId : undefined,
      canonicalCustomerMessageClientId: input.canonicalCustomerMessageClientId,
      tuningSessionId: input.isolatedTestSessionId,
      clientMessageId: input.isolatedTestClientMessageId,
      hveExecutionLane: input.hveExecutionLane,
      conversationHistory: history,
      assetIds: uniqueStrings(input.assetIds),
      variables: {
        channel: input.channel,
        platform: String(input.platform || account.channel || ''),
        postContext: String(input.postContext || ''),
        admissionDecision: {
          messageType: decision.messageType,
          intentLevel: decision.intentLevel,
          riskLevel: decision.riskLevel,
          reason: decision.reason,
        },
        ...(input.variables || {}),
        // Server-owned exact calibration scope. Keep this after client variables so
        // callers cannot widen/narrow the robot identity used for persistent calibration.
        __runtimeCalibrationScope: {
          robotId: String(input.robotId || '').trim() || null,
          authority: 'SERVER_CHANNEL',
        },
      },
      idempotencyKey,
      includeDiagnostics: Boolean(input.isolatedTestSessionId) && input.sourceType === 'ROBOT_TEST_DM',
      generateReply: true,
    }, user, buildTraceContext(input), {
      allowIsolatedTestSession: Boolean(input.isolatedTestSessionId) && input.sourceType === 'ROBOT_TEST_DM',
    });

    return {
      provider: result.replySource === 'FIXED_QA' ? 'FIXED_QA' : 'DEEPSEEK',
      action: 'SEND',
      shouldReply: true,
      skipReply: false,
      skipReason: '',
      messageType: decision.messageType,
      intentLevel: decision.intentLevel,
      riskLevel: decision.riskLevel,
      judgeReason: decision.reason,
      segments: result.segments,
      replySource: result.replySource,
      qualityStatus: result.qualityStatus,
      safetyStatus: result.safetyStatus,
      fallbackUsed: result.fallbackUsed,
      cancelRemainingOnCustomerMessage: result.cancelRemainingOnCustomerMessage !== false,
      replyTraceId: result.replyTraceId,
      ...(result.assistantObservationProof ? { assistantObservationProof: result.assistantObservationProof } : {}),
      ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}),
    };
  }

  private async decideAdmission(
    input: CustomerServiceChannelReplyInput,
    context: { accountName: string; accountProfile: unknown; storeProfile: unknown },
  ): Promise<AdmissionDecision> {
    // Stage 2E-R2A-H1 reliability boundary:
    // ordinary private messages must never depend on a separate LLM admission call
    // before the canonical customer-service runtime can even start. DM admission is
    // deterministic and fail-safe: only narrow, explicit SKIP/HANDOFF surfaces are
    // intercepted here; everything else proceeds to the canonical Plan/Hard/Safety
    // pipeline as SEND. This removes the 8s admission model as a single point of
    // failure without weakening downstream safety authority.
    if (input.channel === 'DM') return resolveDeterministicDmAdmission(input.message);

    const channelRules = [
      'For comments, SEND only when the message is relevant to the post/account, useful to engage with, or contains a genuine inquiry.',
      'Use SKIP for emoji-only noise, meaningless flooding, advertising, abuse, illegal harassment, or content entirely unrelated to the post.',
    ];
    const system = [
      'You are the admission controller for a customer-service channel. Decide whether to send a reply, skip, or hand off. Do not write the reply itself.',
      ...channelRules,
      'Use HANDOFF for clear personal-safety or legal risk, severe escalated complaints, or permissions and promises that require a human decision.',
      'Do not skip merely because the customer is unhappy. Normal reassurance and explanation should remain SEND.',
      'Return JSON only with action, messageType, intentLevel, riskLevel, and reason.',
      'action must be SEND, SKIP, or HANDOFF. intentLevel must be none, low, medium, or high. riskLevel must be LOW, MEDIUM, HIGH, or CRITICAL.',
    ].join('\n');
    const user = JSON.stringify({
      channel: input.channel,
      platform: input.platform || '',
      accountName: context.accountName,
      accountProfile: context.accountProfile,
      storeProfile: context.storeProfile,
      postContext: input.postContext || '',
      latestMessage: input.message,
      recentConversation: normalizeHistory(input.conversationHistory).slice(-8),
    });
    const result = await this.modelGateway.generate({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      jsonMode: true,
      thinkingMode: 'DISABLED',
      temperature: 0.1,
      maxTokens: 450,
      timeoutMs: resolveAdmissionTimeoutMs(),
    });
    if (!result.ok || !result.content) {
      this.logger.warn(`Comment admission model unavailable; conservatively SKIP this comment: ${result.errorMessage || 'unknown model error'}`);
      return {
        action: 'SKIP',
        messageType: 'admission_unavailable',
        intentLevel: 'none',
        riskLevel: 'LOW',
        reason: 'Comment admission unavailable; conservative no-auto-reply fallback',
        model: result.model || null,
        requestId: result.requestId || null,
      };
    }
    const parsed = parseJsonObject(result.content);
    const action = normalizeAction(parsed.action);
    return {
      action,
      messageType: cleanToken(parsed.messageType, 'other'),
      intentLevel: normalizeIntentLevel(parsed.intentLevel),
      riskLevel: normalizeRiskLevel(parsed.riskLevel),
      reason: cleanText(
        parsed.reason,
        action === 'SEND' ? 'The message is suitable for a natural reply' : action === 'HANDOFF' ? 'A human must handle this message' : 'No automatic reply is needed',
      ),
      model: result.model || null,
      requestId: result.requestId || null,
    };
  }
}


function resolveDeterministicDmAdmission(value: string): AdmissionDecision {
  const message = String(value || '').trim();
  const normalized = message.normalize('NFKC');

  // Only explicit cases are intercepted. Ordinary complaints, uncertainty,
  // greetings, product questions, after-sales questions and small talk all SEND.
  if (/(?:自杀|轻生|不想活了|伤害自己|要死了|割腕|跳楼)/iu.test(normalized)) {
    return {
      action: 'HANDOFF',
      messageType: 'personal_safety',
      intentLevel: 'high',
      riskLevel: 'CRITICAL',
      reason: 'Explicit personal-safety risk requires human handling',
      model: null,
      requestId: null,
    };
  }
  if (/(?:律师函|起诉|报警|报案|监管投诉|市场监管|消协投诉).{0,24}(?:已经|马上|现在|正式|准备)|(?:已经|正式)(?:起诉|报警|报案|投诉)/iu.test(normalized)) {
    return {
      action: 'HANDOFF',
      messageType: 'legal_escalation',
      intentLevel: 'high',
      riskLevel: 'HIGH',
      reason: 'Explicit legal/regulatory escalation requires human handling',
      model: null,
      requestId: null,
    };
  }
  const advertising = /(?:加微|加v|加V|微信号|vx|V信|代理招商|渠道合作|引流|刷单|代运营|贷款|博彩|下注|娱乐城|办证|开发票).{0,24}(?:联系|咨询|合作|扫码|进群|加我|私聊)/iu.test(normalized);
  if (advertising) {
    return {
      action: 'SKIP',
      messageType: 'spam_or_traffic_diversion',
      intentLevel: 'none',
      riskLevel: 'LOW',
      reason: 'Deterministic spam/traffic-diversion pattern',
      model: null,
      requestId: null,
    };
  }

  return {
    action: 'SEND',
    messageType: 'ordinary_dm',
    intentLevel: 'medium',
    riskLevel: 'LOW',
    reason: 'Deterministic DM default SEND; canonical runtime retains downstream Plan/Hard/Safety authority',
    model: null,
    requestId: null,
  };
}

function resolveAdmissionTimeoutMs() {
  const parsed = Number(process.env.CUSTOMER_SERVICE_ADMISSION_TIMEOUT_MS || 8_000);
  if (!Number.isFinite(parsed)) return 8_000;
  return Math.max(3_000, Math.min(20_000, Math.round(parsed)));
}


function buildAdmissionConfigurationHash(account: Record<string, any>, input: CustomerServiceChannelReplyInput) {
  return createHash('sha256').update(JSON.stringify({
    admissionPolicy: 1,
    channel: input.channel,
    platform: input.platform || account.channel || '',
    accountProfile: { id: account.id, revision: account.revision },
    storeProfile: account.storeProfile ? { id: account.storeProfile.id, revision: account.storeProfile.revision } : null,
    merchantRole: account.merchantRole ? { id: account.merchantRole.id, revision: account.merchantRole.revision } : null,
    industryNode: account.industryNode ? { id: account.industryNode.id, revision: account.industryNode.revision } : null,
  })).digest('hex');
}

function buildTraceContext(input: CustomerServiceChannelReplyInput) {
  return {
    sourceType: input.sourceType || (input.channel === 'DM' ? 'RUNTIME_DM' : 'RUNTIME_COMMENT'),
    sourceRefId: input.sourceRefId || input.messageId,
    robotId: input.robotId,
    channel: input.channel,
    platform: input.platform,
    conversationId: input.conversationId || (input.channel === 'DM' ? input.recognitionSessionId : undefined),
    commentThreadId: input.commentThreadId || (input.channel === 'COMMENT' ? input.recognitionSessionId : undefined),
    customerMessageId: input.customerMessageId || input.messageId,
    replyMessageId: input.replyMessageId,
    replyAttemptId: input.replyAttemptId,
    postContext: input.postContext,
    conversationSnapshot: {
      history: normalizeHistory(input.conversationHistory, hasBudgetSelectedActiveContext(input.variables)),
      variables: input.variables || {},
    },
  };
}

function normalizeHistory(
  value: CustomerServiceChannelReplyInput['conversationHistory'],
  preserveBudgetSelection = false,
) {
  const normalized = (value || [])
    .map((item) => ({ role: item.role, content: String(item.content || '').trim() }))
    .filter((item): item is { role: 'CUSTOMER' | 'ASSISTANT'; content: string } =>
      (item.role === 'CUSTOMER' || item.role === 'ASSISTANT') && Boolean(item.content),
    );
  return preserveBudgetSelection ? normalized : normalized.slice(-30);
}

function hasBudgetSelectedActiveContext(variables: unknown) {
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) return false;
  const window = (variables as Record<string, unknown>).activeContextWindow;
  return Boolean(
    window
    && typeof window === 'object'
    && !Array.isArray(window)
    && (window as Record<string, unknown>).budgetApplied === true,
  );
}

function buildIdempotencyKey(
  tenantId: string,
  input: CustomerServiceChannelReplyInput,
  history: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>,
) {
  const digest = createHash('sha256').update(JSON.stringify({
    tenantId,
    robotId: input.robotId || '',
    accountProfileId: input.accountProfileId,
    channel: input.channel,
    messageId: input.messageId || '',
    message: input.message.trim(),
    recognitionSessionId: input.recognitionSessionId || '',
    postContext: input.postContext || '',
    history,
  })).digest('hex');
  return `channel-reply:${input.channel.toLowerCase()}:${digest}`;
}

function parseJsonObject(value: string): Record<string, unknown> {
  const normalized = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(normalized);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(normalized.slice(start, end + 1));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      } catch {
        // Fall through to one stable error without exposing raw model output.
      }
    }
  }
  throw new BadGatewayException('DeepSeek channel admission returned invalid JSON');
}

function normalizeAction(value: unknown): AdmissionDecision['action'] {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'SKIP' || normalized === 'HANDOFF') return normalized;
  return 'SEND';
}

function normalizeIntentLevel(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['none', 'low', 'medium', 'high'].includes(normalized) ? normalized : 'none';
}

function normalizeRiskLevel(value: unknown) {
  const normalized = String(value || '').trim().toUpperCase();
  return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(normalized) ? normalized : 'LOW';
}

function cleanToken(value: unknown, fallback: string) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || fallback;
}

function cleanText(value: unknown, fallback: string) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 500) || fallback;
}

function uniqueStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean))).slice(0, 100);
}
