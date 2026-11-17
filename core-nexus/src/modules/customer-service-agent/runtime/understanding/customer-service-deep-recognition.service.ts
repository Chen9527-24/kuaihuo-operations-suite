import { getCustomerServiceDeliveredReferentCandidates, resolveCustomerServiceContextualReferentSelection, resolveCustomerServiceContextualReferentEvidence } from './customer-service-contextual-referent';
import { Injectable } from '@nestjs/common';
import { CustomerServiceModelGateway } from '../../infrastructure/model-gateway/customer-service-model-gateway.service';
import { CompileCustomerServiceSimulationDto } from '../simulation/dto/compile-simulation.dto';
import { canonicalIntentForScenario, inferConversationTaskState, isCustomerServiceScenario } from './customer-service-conversation-task-state';
import { inferHumanContext } from './customer-service-message-understanding.service';
import {
  CustomerServiceCommercialOpenness,
  CustomerServiceCommercialStage,
  CustomerServiceProductMentionPolicy,
  CustomerServiceConversationPhase,
  CustomerServiceConversationStance,
  CustomerServiceEmotionStrategy,
  CustomerServiceFirstMove,
  CustomerServiceHumanContext,
  CustomerServiceIntentHypothesis,
  CustomerServiceMessageUnderstanding,
  CustomerServiceMindset,
  CustomerServicePrimaryMotive,
  CustomerServiceRecognizedItem,
  CustomerServiceRequestedAnswerFocus,
  CustomerServiceRequestedContributionKind,
  CustomerServiceRequestedDecisionMode,
  CustomerServiceRequestedEvidenceScope,
  CustomerServiceResponseAct,
  CustomerServiceRelationshipState,
  CustomerServiceSemanticMoveBudget,
  CustomerServiceStateTruthSignal,
  CustomerServiceTopic,
  CustomerServiceTurnGoal,
} from './types/customer-service-message-understanding.type';
import {
  reconcileCustomerServiceDialogueObligationWithModelSignal,
  resolveCustomerServiceDialogueFeedbackEvidence,
} from './customer-service-dialogue-obligation';
import { readCustomerServiceConversationStateV2, summarizeCustomerServiceConversationState } from '../state/customer-service-conversation-state.reducer';

export type CustomerServiceRecognitionCatalogItem = {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string | null;
  scenario: string;
  primaryIntent: string;
  defaultRiskLevel: string;
  recognitionConfig: unknown;
  examples: unknown;
  priority: number;
};

type ModelRecognitionItem = {
  type?: unknown;
  key?: unknown;
  name?: unknown;
  description?: unknown;
  confidence?: unknown;
  evidence?: unknown;
  isPrimary?: unknown;
  scope?: unknown;
  continuity?: unknown;
  eligibleForIntentLibrary?: unknown;
  suggestedCategory?: unknown;
  suggestedScenario?: unknown;
  suggestedPrimaryIntent?: unknown;
  suggestedRiskLevel?: unknown;
  matchedDefinitionKey?: unknown;
  constraintBasis?: unknown;
  constraintRole?: unknown;
  changesDecisionSpace?: unknown;
};

type ModelRecognitionPayload = Record<string, unknown> & {
  topics?: unknown;
  intentRanking?: unknown;
  recognizedItems?: unknown;
  humanContext?: unknown;
  contextualReferentSignal?: unknown;
  namedOfferingMentionSpans?: unknown;
};

const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const EMOTIONS = ['NEUTRAL', 'ANXIOUS', 'FRUSTRATED', 'DISAPPOINTED', 'ANGRY', 'POSITIVE'] as const;
const MOTIVES: CustomerServicePrimaryMotive[] = [
  'RELATIONSHIP_CONTACT', 'EMOTIONAL_SHARING', 'INFORMATION_SEEKING', 'ACTION_REQUEST',
  'PURCHASE_EXPLORATION', 'PURCHASE_DECISION', 'PROBLEM_RESOLUTION', 'RELATIONSHIP_REPAIR',
];
const MINDSETS: CustomerServiceMindset[] = ['OPEN_AND_RELAXED', 'TASK_FOCUSED', 'CAUTIOUS', 'ANXIOUS', 'DISAPPOINTED', 'ANGRY', 'NEUTRAL'];
const RELATIONSHIPS: CustomerServiceRelationshipState[] = ['FORMAL', 'OPEN', 'FAMILIAR', 'STRAINED'];
const CONVERSATION_STANCES: CustomerServiceConversationStance[] = ['FORMAL_SERVICE', 'FRIENDLY_SERVICE', 'CLOSE_FRIEND_SERVICE', 'REPAIR_SERVICE'];
const OPENNESS: CustomerServiceCommercialOpenness[] = ['CLOSED', 'UNKNOWN', 'LATENT', 'ACTIVE', 'EXPLICIT'];
const COMMERCIAL_STAGES: CustomerServiceCommercialStage[] = ['NO_COMMERCIAL_MOVE', 'RELATIONSHIP_BUILDING', 'CONTEXT_DISCOVERY', 'NEED_EXPLORATION', 'VALUE_BRIDGING', 'PRODUCT_RECOMMENDATION', 'DECISION_SUPPORT', 'LOW_PRESSURE_CLOSE'];
const PRODUCT_MENTION_POLICIES: CustomerServiceProductMentionPolicy[] = ['PROHIBITED', 'CATEGORY_ONLY', 'SPECIFIC_IF_RELEVANT', 'SPECIFIC_ALLOWED'];
const PHASES: CustomerServiceConversationPhase[] = ['OPENING', 'SHARING', 'SERVICE', 'DECISION', 'REPAIR', 'CLOSING'];
const FIRST_MOVES: CustomerServiceFirstMove[] = ['ACKNOWLEDGE_AND_INVITE_SHARING', 'INVITE_SHARING', 'DISCOVER_CONTEXT', 'RESPOND_TO_SHARED_CONTEXT', 'PROCESS_PROVIDED_INFORMATION', 'HANDLE_INFORMATION_BARRIER', 'CLARIFY_NEED', 'SOLVE_CURRENT_ISSUE', 'SUPPORT_DECISION', 'REPAIR_RELATIONSHIP', 'CONFIRM_OR_CLOSE'];
const TIMINGS: CustomerServiceHumanContext['interactionStrategy']['commercialTiming'][] = ['HOLD', 'WAIT_FOR_CONTEXT', 'EXPLORE_IF_RELEVANT', 'ASSIST_NOW'];
const RECOGNITION_SCOPES = ['CONVERSATION', 'TURN'] as const;
const RECOGNITION_CONTINUITIES = ['NEW', 'CONTINUING', 'SHIFTED', 'RESOLVED'] as const;
const CUSTOMER_CONSTRAINT_BASES = [
  'CUSTOMER_ESTABLISHED',
  'QUESTION_TARGET',
  'OPTION_UNDER_EVALUATION',
  'FEEDBACK_OR_ACCEPTANCE',
  'FUTURE_INTENT_ONLY',
  'MODEL_INFERENCE',
  'NOT_APPLICABLE',
] as const;
const CUSTOMER_CONSTRAINT_ROLES = [
  'OPEN_DECISION_CONDITION',
  'DECISION_OUTCOME',
  'ACTION_OR_PURCHASE_INTENTION',
  'QUESTION_OR_OPTION',
  'FEEDBACK_ONLY',
  'MODEL_INFERENCE',
  'NOT_APPLICABLE',
] as const;
const REPLY_MODES = ['PLAYFUL_INVITATION', 'FRIENDLIKE_REACTION', 'WARM_EXPLORATION', 'DIRECT_ANSWER', 'PROFESSIONAL_GUIDANCE', 'ACCOUNTABLE_RESOLUTION', 'CALM_PROGRESS_UPDATE', 'RELATIONSHIP_REPAIR', 'SAFE_BOUNDARY', 'NATURAL_CLOSE'] as const;
const REPLY_CONTINUATIONS = ['INVITE_SHARING', 'OPEN_QUESTION', 'OPEN_STATEMENT', 'WAIT_FOR_CUSTOMER', 'NEXT_SERVICE_STEP', 'CLOSE_NATURALLY'] as const;
const INTENT_ROLES = ['PRIMARY', 'SECONDARY', 'LATENT'] as const;
const CANONICAL_SCENARIOS = [
  'CASUAL_CHAT', 'PRODUCT_CONSULT', 'PRODUCT_COMPARE', 'PRICE_HESITATION', 'ORDER_STATUS',
  'LOGISTICS_DELAY', 'REFUND_REQUEST', 'AFTER_SALE', 'COMPLAINT_ESCALATION', 'APPOINTMENT',
  'SAFETY_SENSITIVE', 'SECURITY_SENSITIVE', 'GENERAL_INQUIRY', 'UNKNOWN',
] as const;
const CANONICAL_PRIMARY_INTENTS = [
  'CASUAL', 'RELATIONSHIP_CONTACT', 'EMOTIONAL_DISCLOSURE', 'ASK_INFORMATION', 'REQUEST_ACTION',
  'EXPRESS_DISSATISFACTION', 'REFUSE_SOLUTION', 'PURCHASE_INTEREST', 'PROBLEM_RESOLUTION', 'UNKNOWN',
] as const;
const TURN_GOAL_KEYS: CustomerServiceTurnGoal['key'][] = [
  'INVITE_POSITIVE_SHARING', 'INVITE_EMOTIONAL_SHARING', 'PROVIDE_EMOTIONAL_COMFORT', 'LISTEN_TO_VENTING', 'PROVIDE_REQUESTED_ADVICE', 'RESPECT_EMOTIONAL_SPACE', 'RESPOND_TO_SHARED_CONTEXT', 'PROCESS_PROVIDED_INFORMATION', 'HANDLE_INFORMATION_BARRIER', 'ANSWER_INFORMATION', 'SUMMARIZE_CONVERSATION',
  'EXECUTE_REQUEST', 'RESOLVE_CURRENT_PROBLEM', 'REPAIR_TRUST', 'CLARIFY_NEED', 'EXPLORE_PRODUCT_NEED',
  'SUPPORT_PURCHASE_DECISION', 'CONFIRM_TRANSACTION', 'DISCOVER_LIFE_CONTEXT', 'MAINTAIN_RELATIONSHIP', 'CLOSE_CONVERSATION',
];
const TURN_GOAL_SOURCES: CustomerServiceTurnGoal['source'][] = ['EXPLICIT', 'CONTEXT', 'STATE', 'SIGNAL', 'MODEL'];
const REQUESTED_CONTRIBUTION_KINDS: CustomerServiceRequestedContributionKind[] = [
  'INFORMATION', 'DECISION_SUPPORT', 'ACTION', 'ADVICE', 'OTHER',
];
const REQUESTED_EVIDENCE_SCOPES: CustomerServiceRequestedEvidenceScope[] = [
  'MERCHANT_BUSINESS', 'GENERAL_DOMAIN', 'NOT_APPLICABLE',
];
const REQUESTED_DECISION_MODES: CustomerServiceRequestedDecisionMode[] = [
  'ASSESS_CURRENT_OPTION', 'SELECT_OR_PRIORITIZE_OPTION', 'NOT_APPLICABLE',
];
const REQUESTED_ANSWER_FOCUSES: CustomerServiceRequestedAnswerFocus[] = [
  'OVERVIEW', 'APPLICATION_USAGE', 'HOW_TO', 'WHY_REASON', 'COMPARISON', 'LIMITATION_BOUNDARY',
  'COMPATIBILITY', 'PRICE_COST', 'AVAILABILITY', 'STATUS_PROGRESS', 'RECOMMENDATION',
  'TROUBLESHOOTING', 'PRODUCT_CAPABILITIES', 'CURRENT_SPECIFIC_QUESTION',
  'AI_IDENTITY', 'PUBLIC_NAME', 'SERVICE_ROLE', 'SERVICE_SCOPE', 'NOT_APPLICABLE',
];
const CURRENT_TURN_AUTHORITATIVE_GOALS = new Set<CustomerServiceTurnGoal['key']>([
  'PROVIDE_EMOTIONAL_COMFORT', 'LISTEN_TO_VENTING', 'PROVIDE_REQUESTED_ADVICE', 'RESPECT_EMOTIONAL_SPACE',
  'PROCESS_PROVIDED_INFORMATION', 'HANDLE_INFORMATION_BARRIER', 'ANSWER_INFORMATION', 'SUMMARIZE_CONVERSATION',
  'EXECUTE_REQUEST', 'RESOLVE_CURRENT_PROBLEM', 'REPAIR_TRUST', 'CLARIFY_NEED',
  'SUPPORT_PURCHASE_DECISION', 'CONFIRM_TRANSACTION', 'CLOSE_CONVERSATION',
]);
const STATE_SUBSTANTIVE_GOALS = new Set<CustomerServiceTurnGoal['key']>([
  'PROVIDE_REQUESTED_ADVICE', 'PROCESS_PROVIDED_INFORMATION', 'HANDLE_INFORMATION_BARRIER',
  'ANSWER_INFORMATION', 'SUMMARIZE_CONVERSATION', 'EXECUTE_REQUEST', 'RESOLVE_CURRENT_PROBLEM',
  'REPAIR_TRUST', 'CLARIFY_NEED', 'SUPPORT_PURCHASE_DECISION', 'CONFIRM_TRANSACTION',
]);
const RECEPTION_ONLY_TURN_GOALS = new Set<CustomerServiceTurnGoal['key']>([
  'RESPOND_TO_SHARED_CONTEXT', 'MAINTAIN_RELATIONSHIP',
]);
const POSTURES: CustomerServiceEmotionStrategy['posture'][] = ['PLAYFUL_WARM', 'WARM_CURIOUS', 'WARM_PROFESSIONAL', 'CALM_REASSURING', 'EMPATHETIC_ACCOUNTABLE', 'CALM_ACCOUNTABLE', 'SERIOUS_REPAIR', 'CAUTIOUS_SERIOUS'];

const DEEP_RECOGNITION_PRIMARY_MAX_TOKENS = 3000;
const DEEP_RECOGNITION_PRIMARY_TIMEOUT_MS = 8_000;
const DEEP_RECOGNITION_TOTAL_BUDGET_MS = 12_000;
const DEEP_RECOGNITION_REPAIR_MIN_BUDGET_MS = 2_000;
const DEEP_RECOGNITION_REPAIR_MAX_TOKENS = 1400;
const DEEP_RECOGNITION_REPAIR_MAX_TIMEOUT_MS = 3_500;

@Injectable()
export class CustomerServiceDeepRecognitionService {
  constructor(private readonly modelGateway: CustomerServiceModelGateway) {}

  async refine(
    dto: CompileCustomerServiceSimulationDto,
    heuristic: CustomerServiceMessageUnderstanding,
    catalog: CustomerServiceRecognitionCatalogItem[],
  ): Promise<CustomerServiceMessageUnderstanding> {
    const fastPathReason = resolveRecognitionFastPath(dto, heuristic);
    if (fastPathReason) {
      return this.attachCatalogMatches(heuristic, catalog, {
        attempted: false,
        status: 'FAST_PATH',
        model: null,
        requestId: null,
        elapsedMs: 0,
        errorMessage: null,
        repairAttempted: false,
        repairSucceeded: false,
        repairRequestId: null,
        parseError: null,
        repairParseError: null,
        finishReason: null,
        responseLength: 0,
        rawResponsePreview: null,
        repairResponsePreview: null,
        recoveryMode: null,
        fastPathReason,
    }, dto.message);
    }

    if (!this.modelGateway.isConfigured()) {
      return this.attachCatalogMatches(heuristic, catalog, {
        attempted: true,
        status: 'MODEL_NOT_CONFIGURED',
        model: null,
        requestId: null,
        elapsedMs: 0,
        errorMessage: '未配置模型，当前使用增强启发式识别。',
    }, dto.message);
    }

    const prompt = buildRecognitionPrompt(dto, catalog);
    const result = await this.modelGateway.generate({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0.08,
      maxTokens: DEEP_RECOGNITION_PRIMARY_MAX_TOKENS,
      jsonMode: true,
      timeoutMs: DEEP_RECOGNITION_PRIMARY_TIMEOUT_MS,
      thinkingMode: 'DISABLED',
    });

    if (!result.ok) {
      return this.attachCatalogMatches(heuristic, catalog, {
        attempted: true,
        status: result.status === 'MODEL_NOT_CONFIGURED'
          ? 'MODEL_NOT_CONFIGURED'
          : result.status === 'INVALID_RESPONSE'
            ? 'INVALID_RESPONSE'
            : 'MODEL_ERROR',
        model: result.model || null,
        requestId: result.requestId || null,
        elapsedMs: result.elapsedMs,
        errorMessage: result.errorMessage,
    }, dto.message);
    }

    const firstParse = parseJsonObjectDetailed(result.content);
    const truncatedByModel = String(result.finishReason || '').toLowerCase() === 'length';
    const firstSchemaError = firstParse.value ? validateRecognitionPayload(firstParse.value) : null;
    const firstParseError = truncatedByModel
      ? '模型因输出长度上限结束，必须使用紧凑结构重新生成。'
      : firstSchemaError || firstParse.error;
    let parsed = truncatedByModel || firstSchemaError ? null : firstParse.value;
    let repairAttempted = false;
    let repairSucceeded = false;
    let repairRequestId: string | null = null;
    let repairElapsedMs = 0;
    let repairParseError: string | null = null;
    let repairResponsePreview: string | null = null;
    let recoveryMode: 'LOCAL_REPAIR' | 'MODEL_REGENERATION' | null = parsed && firstParse.repaired ? 'LOCAL_REPAIR' : null;

    const remainingRecognitionBudgetMs = Math.max(0, DEEP_RECOGNITION_TOTAL_BUDGET_MS - result.elapsedMs);
    if (!parsed && remainingRecognitionBudgetMs >= DEEP_RECOGNITION_REPAIR_MIN_BUDGET_MS) {
      repairAttempted = true;
      // 不再只把残缺长 JSON 原样交给模型补标点；重新提供原任务摘要和紧凑结构，
      // 让模型生成一份更短的合法对象，避免首次输出因长度截断后无法修复。
      const repairPrompt = buildJsonRepairPrompt(prompt.user, result.content, firstParseError);
      const repairResult = await this.modelGateway.generate({
        messages: [
          { role: 'system', content: repairPrompt.system },
          { role: 'user', content: repairPrompt.user },
        ],
        temperature: 0,
        maxTokens: DEEP_RECOGNITION_REPAIR_MAX_TOKENS,
        jsonMode: true,
        timeoutMs: Math.min(DEEP_RECOGNITION_REPAIR_MAX_TIMEOUT_MS, remainingRecognitionBudgetMs),
        thinkingMode: 'DISABLED',
      });
      repairRequestId = repairResult.requestId || null;
      repairElapsedMs = repairResult.elapsedMs;
      repairResponsePreview = previewModelOutput(repairResult.content);
      if (repairResult.ok) {
        const repairedParse = parseJsonObjectDetailed(repairResult.content);
        const repairedSchemaError = repairedParse.value ? validateRecognitionPayload(repairedParse.value) : null;
        parsed = repairedSchemaError ? null : repairedParse.value;
        repairParseError = repairedSchemaError || repairedParse.error;
        repairSucceeded = Boolean(parsed);
        if (parsed) recoveryMode = repairedParse.repaired ? 'LOCAL_REPAIR' : 'MODEL_REGENERATION';
      } else {
        repairParseError = repairResult.errorMessage;
      }
    }

    if (!parsed) {
      return this.attachCatalogMatches(heuristic, catalog, {
        attempted: true,
        status: 'INVALID_RESPONSE',
        model: result.model || null,
        requestId: result.requestId || null,
        elapsedMs: result.elapsedMs + repairElapsedMs,
        errorMessage: repairAttempted
          ? '模型识别结果不是合法 JSON，紧凑结构再生成仍失败，已回退增强启发式识别。'
          : '模型识别结果不是合法 JSON，已回退增强启发式识别。',
        repairAttempted,
        repairSucceeded: false,
        repairRequestId,
        parseError: firstParseError,
        repairParseError,
        finishReason: result.finishReason,
        responseLength: result.content.length,
        rawResponsePreview: previewModelOutput(result.content),
        repairResponsePreview,
        recoveryMode,
    }, dto.message);
    }

    const merged = mergeModelRecognition(dto, heuristic, parsed, catalog);
    return {
      ...merged,
      recognitionModel: {
        attempted: true,
        status: 'SUCCESS',
        model: result.model || null,
        requestId: result.requestId || null,
        elapsedMs: result.elapsedMs + repairElapsedMs,
        errorMessage: null,
        repairAttempted,
        repairSucceeded,
        repairRequestId,
        parseError: firstParseError,
        repairParseError,
        finishReason: result.finishReason,
        responseLength: result.content.length,
        rawResponsePreview: previewModelOutput(result.content),
        repairResponsePreview,
        recoveryMode,
      },
    };
  }

  private attachCatalogMatches(
    understanding: CustomerServiceMessageUnderstanding,
    catalog: CustomerServiceRecognitionCatalogItem[],
    recognitionModel: CustomerServiceMessageUnderstanding['recognitionModel'],
    latestMessage = '',
  ): CustomerServiceMessageUnderstanding {
    const contractAlignedContext = alignHumanContextWithScenarioContract(
      understanding.humanContext,
      understanding.humanContext,
      understanding.primaryScenario,
      understanding.primaryIntent,
      latestMessage,
    );
    return {
      ...understanding,
      humanContext: alignHumanContextWithDominantGoal(contractAlignedContext),
      recognizedItems: attachDefinitionMatches(understanding.recognizedItems, catalog),
      recognitionModel,
    };
  }
}

function buildRecognitionPrompt(
  dto: CompileCustomerServiceSimulationDto,
  catalog: CustomerServiceRecognitionCatalogItem[],
) {
  const compactCatalog = catalog.slice(0, 25).map((item) => ({
    key: item.key,
    name: item.name,
    category: item.category,
    scenario: item.scenario,
    primaryIntent: item.primaryIntent,
    description: String(item.description || '').slice(0, 80) || null,
    recognitionHints: compactRecognitionHints(item.recognitionConfig, item.examples),
  }));
  const stateSummary = summarizeCustomerServiceConversationState(dto.conversationState, dto.message);
  const rawState = readCustomerServiceConversationStateV2(dto.conversationState);
  // Conversation-history visibility is a context-budget decision, not an open-language
  // semantic decision. Keep a stable bounded window instead of expanding it from words
  // such as "previous" / "continue" in the latest customer message.
  const history = (dto.conversationHistory ?? [])
    .slice(-16)
    .map((item) => ({ role: item.role, content: item.content.slice(0, 600) }));

  return {
    system: [
      '你是电商智能客服的“多轮客户识别器”，只负责理解，不生成客服回复。',
      '必须把以下概念分开：INTENT=整段对话中客户持续想得到或推动的目标；EVENT=当前轮发生了什么；STATE=当前业务或对话状态；SIGNAL=暂时不能当成事实的弱信号。',
      '先分析整段对话中仍然持续的多个客户意图，再分析最新一轮的显性表达和优先目标。不要把每一句补充、情绪或描述都新建成长期意图。',
      '一段对话可以同时存在多个意图，但必须区分 PRIMARY、SECONDARY、LATENT，并给出处理优先级。PRIMARY 只表示本轮先处理，不代表其他意图消失。',
      '闲聊中应区分普通轻松交流与情绪倾诉：普通轻松交流保持 CASUAL 或 RELATIONSHIP_CONTACT；明确的失恋、委屈、孤独、压力、吐槽、寻求安慰或倾听等稳定关系目标使用 EMOTIONAL_DISCLOSURE。EMOTIONAL_SHARING、POSITIVE_EMOTION_SHARING、HAPPY_SHARING 仍只作为事件、状态或次级动机。',
      '区分关系接触与情绪支持必须依据客户当前真正请求的社会/情绪功能及其上下文证据；相同或相近措辞可以表达不同功能，不能因共享某个词、短语或句式就升级为负面情绪安慰。',
      'relationshipState 是真实关系事实，只能依据 customerState 明确关系配置或 state/recentConversation 中可验证的已有关系历史判断；不能根据一句话语气、称呼、闲聊场景或关键词制造熟悉度。conversationStance 是本轮服务说话姿态，即使首次接触也可使用 CLOSE_FRIEND_SERVICE，但不能反推 relationshipState 或虚构历史聊天/共同经历。',
      '先看完整多轮上下文，再看最新消息。客户已经开始分享时，不得继续判定为 OPENING；客户补充资料时，不得当成新开场。',
      '必须区分请求—回答关系：客户真正提供了上一轮索取的字段时才识别为 PROCESS_PROVIDED_INFORMATION；客户说不知道、找不到、不愿提供或要求客服自己查看时，应识别为 HANDLE_INFORMATION_BARRIER，不能假装已经收到字段。',
      '售后、物流、退款、投诉和风险场景中，关系友好只属于 conversationStance，不得额外创建 CASUAL_CHAT 客户意图；潜在购买探索和生活场景发现必须暂停。',
      '每个识别项必须标明 scope、continuity、置信度、证据。只有稳定、可复用的 CONVERSATION/INTENT 才允许 eligibleForIntentLibrary=true。',
      '若 latestMessage 明确给出会实质改变当前选择、推荐排序、方案资格或执行可行性的客户条件，使用 recognizedItems 的 STATE 表达该显式决策约束：suggestedCategory=CUSTOMER_CONSTRAINT、scope=CONVERSATION、eligibleForIntentLibrary=false；evidence 必须逐字摘自 latestMessage，key 只标识约束的语义维度而不是具体取值。只记录客户明确给出的条件，不把模型推断、客服建议、一般背景、临时情绪或无决策后果的描述升级为约束。多个独立条件可分别记录，但仍受 recognizedItems 总量限制。',
      '在做“决策空间测试”之前，先做“客户已建立条件测试”：只有 latestMessage 本身已经把某个条件、取值、偏好、限制、资格或现实上下文作为客户侧成立事实交给系统，而不是等待客服回答/比较/确认/选择后才知道，才有资格进入 CUSTOMER_CONSTRAINT。被询问的维度或答案目标、仅处于考虑中的候选选项、对上一轮的接受/评价、没有限制后续可行集合的未来尝试意图、以及模型推断，都不能因为“这个话题会影响推荐”而升级为 CUSTOMER_CONSTRAINT。一个问句可以同时携带独立已建立条件；只保留客户已经建立的那一段条件证据，不把问题目标本身持久化。这个判断按 proposition ownership 和语义功能，不按词形、问号、行业、实体或句式。',
      '再做“开放决策条件角色测试”：CUSTOMER_CONSTRAINT 必须是仍然开放的当前/后续决策所依赖的条件，constraintRole=OPEN_DECISION_CONDITION。客户已经完成或接受的选择/方向属于 DECISION_OUTCOME；准备购买、尝试、执行或之后再做某事属于 ACTION_OR_PURCHASE_INTENTION。它们即使会成为后续对话上下文，也不能被重标成 CUSTOMER_CONSTRAINT；已有 Conversation State 的 DECISION/其他记忆通道负责保存其本来语义。只有一句话中另有可分离的开放决策条件时，才只抽取那段条件作为 CUSTOMER_CONSTRAINT。',
      '通过客户已建立条件测试和开放决策条件角色测试后，再对该独立信息做“决策空间测试”：假设该已建立条件不存在或取值不同，当前仍可采用的方案集合、推荐排序、适用资格、执行方式或现实可行性是否会实质改变；只有三个测试都通过，才输出 STATE + CUSTOMER_CONSTRAINT。每个 CUSTOMER_CONSTRAINT recognizedItem 必须同时写 constraintBasis=CUSTOMER_ESTABLISHED、constraintRole=OPEN_DECISION_CONDITION 且 changesDecisionSpace=true；任何一项不满足都不得标为 CUSTOMER_CONSTRAINT。',
      '同一轮同时包含问题、反馈、补充说明和显式决策约束时，它们是可并存的语义输出：dominantTurnGoal/dialogueFeedbackSignal 不能消费或替代 CUSTOMER_CONSTRAINT。存在 qualifying constraint 时，recognizedItems 必须优先为它保留条目，再考虑重复表达同一语义的普通 EVENT/STATE。',
      '不能为了匹配数据库而强行套用已有意图。当前没有正式意图时仍要给出完整聊天策略，不能退化成空泛回复。',
      '已有意图库只能用于关联；精确符合时填写 matchedDefinitionKey，不符合时留空并产出可审核的新识别意图。',
      '风险判断不得因语气温和而忽略退款、投诉、安全、售后或物流事实。推断必须标为推断，不能把弱商业信号当成购买事实。',
      '场景和话语动作必须分开判断：同为物流、退款、售后或预约场景，询问规则、原因或状态使用 ASK_INFORMATION，明确要求实际推进才使用 REQUEST_ACTION；不得用场景名直接覆盖话语动作。',
      `主场景只能从以下规范值选择：${CANONICAL_SCENARIOS.join('、')}。不得自造 SAFETY、SAFETY_INCIDENT、PRE_SALE、LOGISTICS 等近义场景。`,
      `主意图只能从以下规范值选择：${CANONICAL_PRIMARY_INTENTS.join('、')}。EXECUTE_REQUEST、ANSWER_INFORMATION 等是本轮目标，不是主意图。`,
      '比较两个或多个商品、版本、规格、颜色、套餐或替代选项时使用 PRODUCT_COMPARE；PRODUCT_CONSULT 只用于理解单个商品或提出商品需求。',
      '只要客户描述商品、设备或使用过程可能导致人身伤害、误食、过敏、灼伤、烟火、电气或化学风险，就使用 SAFETY_SENSITIVE/HIGH；不能降为普通售后，也不能自造安全场景名。',
      '客户明确拒绝推荐、购买、解释、追问或当前方案时，主意图使用 REFUSE_SOLUTION；拒绝后的自然聊天姿态不能把拒绝本身降成 CASUAL。',
      '多轮中最新消息明确转向新服务任务时，新任务必须成为 PRIMARY 且 continuity=SHIFTED；旧投诉或旧高风险任务可作为暂停的次级上下文，不得继续抢占主场景和本轮风险。',
      '多个独立诉求同时出现时，intentRanking 必须保留可分别处理的 SECONDARY；不要把退款与物流、投诉与售后合并成一个宽泛任务。',
      '句末标点或问句表面形式不等于信息咨询；若语义功能是在表达不满、纠正、拒绝或其他动作，应按该功能分类。否定、条件和禁止性约束必须按 proposition-level 语义保留，不能因句式变化被丢失。',
      '当最新消息依赖缺失上下文、信息过少且无法稳定归类时，允许输出 UNKNOWN/UNKNOWN，confidence 不得高于 0.45；不要把不确定输入包装成高置信明确意图。',
      '客户主动进入商家客服窗口并表示想聊天，只能作为潜在商业开放信号。主意图仍可保持 CASUAL/RELATIONSHIP_CONTACT，不得直接判为购买意图。',
      '客户正在分享旅行、通勤、居住、穿着、运动、送礼等具体生活上下文时，本轮先用 RESPOND_TO_SHARED_CONTEXT 回应分享本身；相关商品可能性只作为 LATENT/PURCHASE_EXPLORATION 且 deferred，不能用 DISCOVER_LIFE_CONTEXT 抢占当前回应。',
      '经营阶段和完整关系状态由本地确定性层根据最终场景补齐；模型只需在 humanContext 中给出有证据的 primaryMotive、commercialOpenness 和本轮目标，不得复制完整商业策略。',
      '必须输出 rankedTurnGoals 和 dominantTurnGoal。本轮主导目标只决定第一动作与执行顺序，不能删除同一 latestMessage 中另一个仍需本轮完成的独立义务；潜在商业信号不得越过更明确的分享、问题解决、操作请求或风险目标。',
      'Turn Goal 必须按客户要求客服实际完成的功能来判断，不按问句形式、礼貌程度或粗粒度场景/主意图标签来判断。事实信息本身、购买选择支持、一般建议和实际执行是不同功能；同一场景中不能互相替代。',
      '本次 Deep Recognition 的正向语义判断必须直接基于 latestMessage、真实 history/state、显式配置和本 schema；本地 heuristic/pragmatic fallback 不作为模型输入语义锚点。模型结果有效时，下游不得再从 raw wording、关键词或正则重建业务 Turn Goal。',
      '每个当前轮 Turn Goal 还必须输出 requestedContributionKind，描述客户实际要求客服完成的贡献功能，而不是句子表面形式：INFORMATION=只要事实/属性/原因/规则/状态信息；DECISION_SUPPORT=要客服形成与选择、适配或取舍相关的判断，包括评估当前已明确选项本身，或在多个候选、方案、商品或方向间作选择、推荐、排序、优先级或取舍；具体决策角色由 requestedDecisionMode 区分；ACTION=要客服实际推进/执行；ADVICE=要一般性下一步建议但不是商家购买选择；OTHER=其余现有 Turn Goal。这个 typed field 与 goal key 属于同一个 Deep Recognition semantic envelope；下游只做确定性投影，不得再从 raw wording、问句形式、关键词或正则重建这些语义。',
      '每个当前轮 Turn Goal 同时必须输出 requestedEvidenceScope，表示完成该义务时事实/选择结论的证据所有权：MERCHANT_BUSINESS=正确完成依赖当前商家、店铺、具体商品/服务、业务状态/规则或当前可提供候选的事实；GENERAL_DOMAIN=结论不依赖当前商家事实，可由一般领域知识完成；NOT_APPLICABLE=该 Turn Goal 本身不要求事实/选择结论。这个轴按 proposition/任务实际语义判断，不能根据是否已经检索到 Knowledge、是否存在 ref、外层问句形式或 contribution label 推断。',
      '每个当前轮 Turn Goal 还必须输出 requestedDecisionMode。仅当 requestedContributionKind=DECISION_SUPPORT 时，按客户真正要求的决策功能选择：ASSESS_CURRENT_OPTION=评估、判断或解释一个已经明确/承接中的当前选项本身是否适合、表现如何、风险或体验如何，但没有要求改选另一个对象；SELECT_OR_PRIORITIZE_OPTION=要求在候选、方案、商品或方向之间选择、推荐、排序、优先级或取舍。其他 contribution kind 必须输出 NOT_APPLICABLE。这个轴按语义角色判断，不能靠“适合/推荐/哪个”等固定词、实体类型、问号或行业规则推断；同一 Turn 可同时存在 INFORMATION 与 ASSESS_CURRENT_OPTION 等独立 required goal。',
      '每个当前轮 Turn Goal 同时必须输出 requestedAnswerFocus，表示客户要求回答的语义 facet，而不是业务动作强度：PRODUCT_CAPABILITIES=具体商品/服务在实际使用中的能力、性能或体验表现；COMPATIBILITY=当前对象与客户条件/场景的适配或兼容性；PRICE_COST / AVAILABILITY / STATUS_PROGRESS=对应明确业务事实 facet；HOW_TO / TROUBLESHOOTING / WHY_REASON / COMPARISON 等按真实回答目标选择；普通属性或未落入更具体 facet 的当前事实问题用 CURRENT_SPECIFIC_QUESTION；身份/角色类使用对应有限值；确实不适用才用 NOT_APPLICABLE。requestedAnswerFocus 与 requestedContributionKind / requestedEvidenceScope / requestedDecisionMode 正交：例如客户可以用 INFORMATION 方式询问当前商品的 PRODUCT_CAPABILITIES，也可以用 DECISION_SUPPORT/ASSESS_CURRENT_OPTION 方式评估 COMPATIBILITY。下游只消费该 typed facet，不得再从 raw wording、关键词、行业词或正则重建。',
      '复合请求必须按可独立验收的语义义务拆入 rankedTurnGoals：并列问题、一个事实判断后附带的条件动作/备选动作、以及“若前一结论不成立则继续做另一动作”都仍是本轮语义义务。条件分支是否最终执行由事实结果决定，但不能因为它位于后半句、条件从句、问句或与 dominantTurnGoal 不同而从 rankedTurnGoals 消失。不要用固定关键词、固定句式、问号数量或标点模板判断是否存在该义务，要按客户要求客服实际完成什么动作来判断。',
      '若 rankedTurnGoals/dominantTurnGoal 声称描述 latestMessage 当前这一轮的语义动作，evidence 必须逐字摘自 latestMessage；只来自前文、历史任务或状态的证据必须保留为 CONTEXT/STATE 背景，不能借数值 priority 覆盖当前轮有原文证据的实质任务。',
      '当最新消息与上一轮客服贡献存在承接关系时，使用 humanContext.dialogueFeedbackSignal 表达这段关系，包括接受、复述/归纳既有结论并仅作理解确认、评价、纠正、拒绝，或报告建议的实际尝试结果。它只描述客户怎样接收上一轮贡献，不拥有、替换或降低当前 Turn Goal：ACCEPTED 可以与任何当前新义务同时存在，不能单独授权 CLOSE_CONVERSATION。必须明确区分“接受或确认已经给出的完整贡献”“已经尝试且有效/部分有效/无效”“拒绝这个方案”“纠正上一轮理解”“仍在提出新的普通追问”。复述、归纳或核对前述内容本身不等同于新的信息请求；若没有引入独立的新事实问题、条件、操作、必要补充、修正、结果或风险，应输出 userFeedback=ACCEPTED，previousAdviceOutcome=NONE，并由 dominantTurnGoal 自己表达是否收束。不得仅凭负面语气推断拒绝；previousAdviceOutcome 只有在当前消息明确说明实际尝试结果时才能使用。evidence 必须逐字摘自 latestMessage，并使用足以证明该信号的最小原文片段；同一轮同时包含反馈和新请求时，feedback evidence 只引用反馈片段，current goal evidence 只引用新请求片段，不得让两者共同引用整句消息。',
      'dialogueFeedbackSignal 的 userFeedback 与 requestedDeltas 是正交轴：要求继续增加具体性、细节、深度或另一个选项，本身不能证明上一轮“不够”或被拒绝。receptionEvidence.accepted 与 receptionEvidence.insufficient 必须分别填写能直接证明“上一轮贡献被接受”和“上一轮贡献明确不足/仍未解决”的最小逐字片段；没有对应直接证据就留空，同一原文片段不得同时充当两种证据。存在 accepted evidence、但没有 insufficient/rejection/correction evidence 时，即使本轮同时要求 MORE_SPECIFIC / MORE_DETAILED / DEEPER / ANOTHER_OPTION，userFeedback 仍应是 ACCEPTED；accepted 与 insufficient 两类独立证据同时存在时使用 PARTIALLY_ACCEPTED；只有 insufficient evidence 而没有 accepted evidence 时才使用 INSUFFICIENT。',
      'contextualReferentSignal 只解析当前消息对上一轮已交付商品或已交付候选集合的指代关系。候选只来自 deliveredReferentCandidates，每项是已经证明的原始语义片段；按实际推荐、排除、对比等角色解析，不能凭提及顺序选择。先判断当前问题是否指向一个先前具体商品、还是明确指向两个及以上先前候选组成的集合，而非通用类别或一般原理：无该关系才输出 NONE。若唯一指向一个候选，输出 UNIQUE，并用 candidateId + sourceQuote 绑定该候选；若当前消息明确要求在先前多个候选中比较、选择、排序或取舍，且关系能唯一确定一个候选集合，输出 SET，并用 candidateIds + sourceQuotes 逐项绑定该集合，不能把明确集合指代降成 AMBIGUOUS。只有无法确定究竟是哪一个候选或哪一个候选子集时才输出 AMBIGUOUS；存在关系但候选缺失或无法闭合时输出 UNRESOLVED。SET 至少包含两个候选，candidateIds 不得包含 deliveredReferentCandidates 之外的 ID；UNIQUE/SET/AMBIGUOUS/UNRESOLVED 都必须以 evidence 逐字引用当前指代关系。不得生成 Grounding ID，不得将历史回复或关系选择当作新增商品事实。',
      'namedOfferingMentionSpans 只做当前 latestMessage 的命名实体分段：逐项输出客户实际用来命名某个具体商品/服务的连续逐字片段。必须保留客户自己给出的更长名称修饰，不能因为其中包含已知词面而截短；同时不得把商品名之后的场景、用途、属性、评价、条件或问句谓词吞进名称。没有明确命名对象时输出空数组。该字段不得输出 catalog/entity/Grounding ID，也不能授权商品事实；Runtime 只允许把逐字 span 与 server-owned canonical identity 做精确映射。',
      'receptionEvidence.rejected / corrected 分别引用真实拒绝方案 / 纠正理解的最小逐字证据，没有就留空；新问题及具体性要求不能充当这些证据。',
      'R1 长期状态只允许通过 humanContext.stateTruthSignal 提供“状态变更证据”，它不是状态 Authority。只有 latestMessage 明确表示继续当前任务、开启独立新任务、返回已暂停任务、完成/放弃当前任务，或明确纠正/撤回某条已存事实/实体时才填写。targetTaskId/targetMemoryId/targetEntityId 必须严格从 conversationState.stateMutationCandidates 提供的 ID 中选择，不能自造。',
      'stateTruthSignal 的 task/memory/entity 各自 evidence 必须逐字摘自 latestMessage，confidence 不足或无法唯一定位 target 时必须输出 NONE；宁可不修改长期状态，也不能猜错。memory/entity 的 replacementValue 若填写，必须是 latestMessage 中逐字出现的新值。不得因礼貌、衔接或话题连接性的表面标记自动认定换任务、完成任务或状态变更；必须由完整 proposition-level 语义和逐字 evidence 建立。',
      '先确定当前轮是否存在必须完成的语义贡献，再考虑 CLOSE_CONVERSATION。若正确回复必须补充上一轮尚未给出的事实、判断、适用性、选择、操作、修正、结果处理或风险处理，就必须选择对应的非结束 Turn Goal；即使同一句也在接受上一轮、语气礼貌、准备稍后离开，当前新义务仍优先。只有正确回复无需增加这些贡献、只需确认已经完整覆盖的理解或自然告别时，才使用 CLOSE_CONVERSATION/CLOSING。CLOSE_CONVERSATION 允许必要的简短确认，并不表示沉默；但不能把每次答完后的正常停顿误当成结束交流。不要根据问句形式决定，必须比较当前请求与上一轮已覆盖内容的语义关系。',
      'RESPOND_TO_SHARED_CONTEXT 和 MAINTAIN_RELATIONSHIP 只表示客户本轮提供了独立的新分享或新的关系互动目标，不能作为接受、认可或感谢上一轮完整贡献的兜底标签。若 dialogueFeedbackSignal 已经完整拥有本轮内容，且没有可分离的新事实、问题、条件、操作、修正、结果、风险或关系请求，dominantTurnGoal 应为 CLOSE_CONVERSATION；若存在独立新内容，必须把它的最小原文证据与 feedback evidence 分开。',
      '特别区分“当前交流自然收束”和“长期任务已经解决”：客户可以接受前述方向、表示接下来会自行尝试/处理，并自然结束本次交流，即使更长期的购买、售后或问题解决任务客观上仍可继续，此时当前 Turn Goal 仍应是 CLOSE_CONVERSATION；不要因为 conversationState 里仍有 activeTask、历史服务场景仍在、或未来理论上还能继续咨询，就把本轮重新判成 CASUAL_CHAT、信息任务、服务继续或商业推进。CLOSE_CONVERSATION 是当前轮对话动作，不要求 stateTruthSignal.task=RESOLVE_CURRENT。',
      'Natural Close 的反向边界必须同时守住：若最新一轮还在索取新信息、提出新问题/新条件、报告实际尝试结果、纠正上一轮、要求继续操作，或存在仍需本轮处理的风险/必要信息，则不得仅因其中含有接受、礼貌或离场语气而关闭；这些实质动作应优先成为 dominantTurnGoal。rankedTurnGoals 必须包含 dominantTurnGoal；只要 rankedTurnGoals 中存在有 latestMessage 原文证据、非 deferred 的实质非结束目标，就不得同时输出 CLOSE_CONVERSATION。',
      '当客户明确表达开心并主动想聊天时，INVITE_POSITIVE_SHARING 通常高于 DISCOVER_LIFE_CONTEXT；先承接分享欲，等客户给出具体内容后再探索生活场景。',
      '多轮对话中稳定意图可以不变，但次级意图、TURN 目标、EVENT、STATE、商业开放度和 commercialStrategy.stage 应随新增信息推进。投诉、未解决售后、明确拒绝推荐时必须回到 NO_COMMERCIAL_MOVE。',
      '输出合法 JSON，字段严格按用户消息给出的“语义增量结构”；namedOfferingMentionSpans 必须始终输出数组（没有明确命名对象时为 []）；未列出的完整人类上下文字段由本地确定性层补齐。',
      '输出必须精简：intentRanking 最多3项，recognizedItems 最多3项，只保留关键 INTENT/EVENT 与当前明确、会改变决策的 CUSTOMER_CONSTRAINT STATE；若存在这类显式决策约束，应优先保留它，而不是让重复表达同一语义的普通 EVENT/STATE 占用 recognizedItems 容量；rankedTurnGoals 最多3项；每项 evidence 最多1条。',
      '禁止输出 topics、commercialStrategy、interactionStrategy、replyStrategy、conversationTaskState、statedNeeds、inferredNeeds、uncertainties 或其他未列字段；不要解释 JSON。',
    ].join('\n'),
    user: JSON.stringify({
      task: '深度识别本轮客户消息，并结合前文更新对话阶段和本轮动作。',
      latestMessage: dto.message.trim(),
      conversationHistory: history,
      deliveredReferentCandidates: getCustomerServiceDeliveredReferentCandidates(rawState),
      conversationState: {
        activeTask: stateSummary.activeTask,
        suspendedTasks: stateSummary.suspendedTasks.slice(-4),
        relevantMemories: stateSummary.relevantMemories.map((item) => ({
          id: item.id,
          kind: item.kind,
          key: item.key,
          value: item.value,
          sourceTurn: item.sourceTurn,
        })),
        latestFeedback: stateSummary.latestFeedback,
        closedSemanticQuestions: stateSummary.closedSemanticQuestions,
        stateMutationCandidates: {
          tasks: rawState.tasks
            .filter((item) => item.status !== 'ABANDONED')
            .slice(-12)
            .map((item) => ({ id: item.id, scenario: item.scenario, intent: item.intent, goal: item.goal, status: item.status, anchors: (item.anchors || []).slice(-4) })),
          memories: rawState.memories
            .filter((item) => !item.invalidated && !item.withdrawn)
            .filter((item) => stateSummary.relevantMemories.some((memory) => memory.id === item.id)
              || item.sourceTurn >= Math.max(0, rawState.currentTurn - 3))
            .slice(-16)
            .map((item) => ({ id: item.id, kind: item.kind, key: item.key, value: item.value, sourceTurn: item.sourceTurn })),
          entities: rawState.entities
            .filter((item) => !item.invalidated)
            .slice(-20)
            .map((item) => ({ id: item.id, type: item.type, semanticKey: item.semanticKey, value: item.canonicalValue, lastSeenTurn: item.lastSeenTurn })),
        },
      },
      customerState: dto.customerState ?? {},
      industryNodeId: dto.industryNodeId ?? null,
      manualOverrides: { scenario: dto.scenario ?? null, intent: dto.intent ?? null, riskLevel: dto.riskLevel ?? null },
      semanticAuthorityContract: {
        authority: 'DEEP_RECOGNITION_CURRENT_TURN_SEMANTICS',
        lexicalFallbackAuthority: 'NONE_WHEN_MODEL_RESULT_IS_VALID',
        dominantGoalRule: 'dominantTurnGoal orders active typed obligations; it does not erase rankedTurnGoals.',
      },
      decisionConstraintAudit: {
        authority: 'RECOGNITION_REQUIREMENT_ONLY',
        source: 'latestMessage explicit customer-owned information only',
        admissionTest: '先确认 proposition 已由客户在 latestMessage 中建立为成立条件，而不是待回答的问题目标、待比较/待选择候选、上一轮反馈、仅表示之后会尝试但不限制可行集合的未来意图、或模型推断。',
        roleTest: '再确认它是仍开放决策所依赖的条件（OPEN_DECISION_CONDITION），而不是已经完成/接受的决策结果（DECISION_OUTCOME）或购买/尝试/执行意图（ACTION_OR_PURCHASE_INTENTION）。',
        decisionSpaceTest: '仅对开放决策条件继续判断：若该条件不存在或取值不同，当前方案集合、排序、资格、执行方式或现实可行性是否会实质改变。',
        output: 'only when all three tests pass: recognizedItems STATE + CUSTOMER_CONSTRAINT + CONVERSATION + constraintBasis=CUSTOMER_ESTABLISHED + constraintRole=OPEN_DECISION_CONDITION + changesDecisionSpace=true + verbatim latestMessage evidence',
      },
      formalIntentCatalog: compactCatalog,
      outputSchema: {
        contextualReferentSignal: { status: 'NONE|UNIQUE|SET|AMBIGUOUS|UNRESOLVED', candidateId: 'UNIQUE 时为 deliveredReferentCandidates 中的一个 ID，否则 null', candidateIds: 'SET 时为 deliveredReferentCandidates 中至少两个 ID，否则 []', evidence: '存在具体商品/候选集合指代时必须提供当前关系的最小逐字片段，NONE 为空', sourceQuote: 'UNIQUE 时提供候选已交付文本中证明该关系的逐字片段，否则为空', sourceQuotes: 'SET 时逐项提供与 candidateIds 对齐的候选已交付文本逐字片段，否则 []', confidence: '0..1' },
        namedOfferingMentionSpans: ['latestMessage 中客户实际命名具体商品/服务的连续逐字 span；无则空数组；不得输出 catalog/entity/Grounding ID'],
        primaryScenario: CANONICAL_SCENARIOS,
        primaryIntent: CANONICAL_PRIMARY_INTENTS,
        riskLevel: 'LOW|MEDIUM|HIGH|CRITICAL',
        emotion: 'NEUTRAL|ANXIOUS|FRUSTRATED|DISAPPOINTED|ANGRY|POSITIVE',
        confidence: '0..1',
        intentRanking: [{
          scenario: 'UPPER_SNAKE_CASE', intent: 'UPPER_SNAKE_CASE',
          role: INTENT_ROLES, scope: 'CONVERSATION|TURN', continuity: RECOGNITION_CONTINUITIES,
          confidence: '0..1', priority: '数值，越高越优先', evidence: ['最多1条原文证据'],
        }],
        recognizedItems: [{
          type: 'INTENT|EVENT|STATE',
          key: '英文小写短横线编码',
          name: '简短语义名称；描述该识别项是什么，不写具体取值',
          confidence: '0..1',
          evidence: ['最多1条原文或上下文证据'],
          isPrimary: true,
          scope: 'CONVERSATION|TURN',
          continuity: 'NEW|CONTINUING|SHIFTED|RESOLVED',
          suggestedScenario: 'UPPER_SNAKE_CASE',
          suggestedPrimaryIntent: 'UPPER_SNAKE_CASE',
          suggestedCategory: 'CUSTOMER_CONSTRAINT 仅用于客户明确决策约束；其他识别项使用既有分类',
          matchedDefinitionKey: '已有意图 key 或 null',
          constraintBasis: 'CUSTOMER_ESTABLISHED|QUESTION_TARGET|OPTION_UNDER_EVALUATION|FEEDBACK_OR_ACCEPTANCE|FUTURE_INTENT_ONLY|MODEL_INFERENCE|NOT_APPLICABLE；仅 CUSTOMER_ESTABLISHED 可继续判断 CUSTOMER_CONSTRAINT',
          constraintRole: 'OPEN_DECISION_CONDITION|DECISION_OUTCOME|ACTION_OR_PURCHASE_INTENTION|QUESTION_OR_OPTION|FEEDBACK_ONLY|MODEL_INFERENCE|NOT_APPLICABLE；仅 OPEN_DECISION_CONDITION 可配 CUSTOMER_CONSTRAINT',
          changesDecisionSpace: 'boolean；仅对 CUSTOMER_ESTABLISHED + OPEN_DECISION_CONDITION 判断，且必须为 true 才可配 CUSTOMER_CONSTRAINT',
        }],
        humanContext: {
          primaryMotive: MOTIVES,
          commercialOpenness: OPENNESS,
          rankedTurnGoals: [{
            key: TURN_GOAL_KEYS, requestedContributionKind: REQUESTED_CONTRIBUTION_KINDS, requestedEvidenceScope: REQUESTED_EVIDENCE_SCOPES, requestedDecisionMode: REQUESTED_DECISION_MODES, requestedAnswerFocus: REQUESTED_ANSWER_FOCUSES, priority: '数值，越高越优先', confidence: '0..1',
            evidence: ['若为当前轮目标，必须逐字摘自 latestMessage；否则最多1条上下文证据'],
            source: TURN_GOAL_SOURCES, deferred: 'boolean',
          }],
          dominantTurnGoal: { key: TURN_GOAL_KEYS, requestedContributionKind: REQUESTED_CONTRIBUTION_KINDS, requestedEvidenceScope: REQUESTED_EVIDENCE_SCOPES, requestedDecisionMode: REQUESTED_DECISION_MODES, requestedAnswerFocus: REQUESTED_ANSWER_FOCUSES, priority: 1000, confidence: 0.9, evidence: ['若为当前轮目标，必须逐字摘自 latestMessage'], source: 'EXPLICIT|CONTEXT|STATE|SIGNAL|MODEL', deferred: false },
          dialogueFeedbackSignal: {
            userFeedback: 'ACCEPTED|PARTIALLY_ACCEPTED|INSUFFICIENT|REJECTED|CORRECTED|ESCALATED|WITHDRAWN|UNCLEAR',
            previousAdviceOutcome: 'NONE|TRIED_EFFECTIVE|TRIED_PARTIAL|TRIED_INEFFECTIVE',
            requestedDeltas: '数组，最多3项；每项只能从 DEEPER / MORE_SPECIFIC / MORE_DETAILED / WARMER / LESS_WARM / LESS_FORMAL / MORE_DIRECT / SHORTER / DIFFERENT_APPROACH / ANOTHER_OPTION / NO_SPECIFIC_RECOMMENDATION / HUMOR_OK / NO_HUMOR / NO_QUESTIONS / NO_ADVICE / LISTEN_ONLY / ANSWER_PREVIOUS_QUESTION / RETURN_TO_PREVIOUS_TOPIC / STOP_CURRENT_TOPIC 中选择',
            correctionTarget: 'CONTENT|TONE|WORDING|INTERACTION|BUSINESS_ACTION|null',
            evidence: 'latestMessage 中足以证明该 feedback signal 的最小逐字片段；与同轮独立新请求的 goal evidence 分开；没有直接证据则留空',
            receptionEvidence: {
              rejected: '拒绝上一轮方案的最小逐字证据，无则空字符串',
              corrected: '纠正上一轮理解的最小逐字证据，无则空字符串',
              accepted: '能直接证明上一轮贡献被接受的最小逐字片段；没有则空字符串',
              insufficient: '能直接证明上一轮贡献明确不足或仍未解决的最小逐字片段；没有则空字符串',
            },
            confidence: '0..1',
          },
          stateTruthSignal: {
            task: { relation: 'NONE|CONTINUE_CURRENT|START_NEW|RESUME_EXISTING|RESOLVE_CURRENT|ABANDON_CURRENT', targetTaskId: '只能选 stateMutationCandidates.tasks.id 或 null', evidence: 'latestMessage 逐字证据', confidence: '0..1' },
            memory: { action: 'NONE|SUPERSEDE|WITHDRAW', targetMemoryId: '只能选 stateMutationCandidates.memories.id 或 null', replacementValue: 'latestMessage 中逐字新值或 null', evidence: 'latestMessage 逐字证据', confidence: '0..1' },
            entity: { action: 'NONE|SUPERSEDE|WITHDRAW', targetEntityId: '只能选 stateMutationCandidates.entities.id 或 null', replacementValue: 'latestMessage 中逐字新值或 null', evidence: 'latestMessage 逐字证据', confidence: '0..1' },
          },
        },
      },
    }),
  };
}

function mergeModelRecognition(
  dto: CompileCustomerServiceSimulationDto,
  heuristic: CustomerServiceMessageUnderstanding,
  payload: ModelRecognitionPayload,
  catalog: CustomerServiceRecognitionCatalogItem[],
): CustomerServiceMessageUnderstanding {
  const manualScenario = normalizeCode(dto.scenario);
  const manualIntent = normalizeCode(dto.intent);
  const rawModelTurnGoals = resolveCustomerServiceRawModelTurnGoals(payload, dto.message);
  const rawModelCurrentGoal = resolveCustomerServiceModelCurrentTurnGoal(payload, dto.message);
  const rawModelScenario = normalizeModelScenario(payload.primaryScenario);
  const rawModelIntent = normalizeModelPrimaryIntent(payload.primaryIntent);
  const turnOverride = resolveModelTurnOverride(payload, rawModelScenario);
  const modelScenario = turnOverride?.scenario || rawModelScenario;
  const modelIntent = resolveModelIntentFromSemanticGoal(
    payload,
    modelScenario,
    turnOverride?.intent || rawModelIntent,
    rawModelCurrentGoal,
  );
  const modelConfidence = clampNumber(payload.confidence, 0.7, 0, 1);

  // Deterministic pre-model semantics are allowed to survive a valid model envelope
  // only for the independent Safety/Security hard floor. All positive business,
  // commercial, emotional, lifecycle and interaction semantics are model-owned.
  const hardFloorScenario = ['SAFETY_SENSITIVE', 'SECURITY_SENSITIVE'].includes(heuristic.primaryScenario)
    && heuristic.topics.some((topic) => topic.evidence.some((item) => /HARD_FLOOR/.test(item)))
      ? heuristic.primaryScenario : null;
  const primaryScenario = manualScenario || hardFloorScenario || modelScenario || 'GENERAL_INQUIRY';
  const rawPrimaryIntent = manualIntent
    || (hardFloorScenario ? heuristic.primaryIntent : null)
    || modelIntent
    || 'ASK_INFORMATION';
  const primaryIntent = canonicalIntentForScenario(primaryScenario, rawPrimaryIntent);

  const stateTruthSignal = resolveCustomerServiceStateTruthSignal(
    asRecord(payload.humanContext).stateTruthSignal,
    dto.message,
    dto.conversationState,
  );
  const inferredTaskState = inferConversationTaskState(dto, primaryScenario, primaryIntent);
  const modelSignalsTopicShift = Boolean(dto.conversationHistory?.length)
    && resolveModelTopicShift(payload, primaryScenario, turnOverride);
  const effectiveTopicShift = stateTruthSignal.task.relation === 'START_NEW' || modelSignalsTopicShift;
  const finalTaskState = alignCustomerServiceConversationTaskStateWithModel(
    inferredTaskState,
    payload,
    primaryScenario,
    primaryIntent,
    effectiveTopicShift,
    dto.message,
    stateTruthSignal,
  );

  const riskFloor = minimumRiskForScenario(primaryScenario);
  const hardFloorRisk = hardFloorScenario ? heuristic.riskLevel : riskFloor;
  const modelRisk = normalizeEnum(payload.riskLevel, RISK_LEVELS, riskFloor);
  const riskLevel = maxRisk(
    riskFloor,
    hardFloorRisk,
    modelRisk,
    dto.riskLevel ? normalizeEnum(dto.riskLevel, RISK_LEVELS, riskFloor) : riskFloor,
  );
  const emotion = normalizeEnum(payload.emotion, EMOTIONS, 'NEUTRAL');

  const fallbackHumanContext = inferHumanContext({
    dto,
    message: dto.message.trim(),
    normalized: dto.message.trim().toLowerCase(),
    scenario: primaryScenario,
    intent: primaryIntent,
    emotion,
    riskLevel,
    conversationTaskState: finalTaskState,
  });
  const previousAssistantText = [...(dto.conversationHistory ?? [])]
    .reverse()
    .find((item) => item.role === 'ASSISTANT')?.content?.trim() || '';
  const feedbackAwareFallbackHumanContext: CustomerServiceHumanContext = {
    ...fallbackHumanContext,
    stateTruthSignal,
    dialogueObligation: reconcileCustomerServiceDialogueObligationWithModelSignal(
      fallbackHumanContext.dialogueObligation,
      asRecord(payload.humanContext).dialogueFeedbackSignal,
      {
        message: dto.message,
        previousAssistantText,
        currentTurnGoalEvidence: rawModelCurrentGoal?.evidence || [],
        currentTurnGoalKey: rawModelCurrentGoal?.key,
      },
    ),
  };
  const modelHumanContextRecord = asRecord(payload.humanContext);
  const modelCompatibilityFallbackHumanContext = projectCustomerServiceValidModelCompatibilityContext(
    feedbackAwareFallbackHumanContext,
    {
      primaryMotive: normalizeEnum(modelHumanContextRecord.primaryMotive, MOTIVES, feedbackAwareFallbackHumanContext.primaryMotive),
      commercialOpenness: normalizeEnum(modelHumanContextRecord.commercialOpenness, OPENNESS, feedbackAwareFallbackHumanContext.commercialOpenness),
      dominantTurnGoal: rawModelCurrentGoal || feedbackAwareFallbackHumanContext.dominantTurnGoal,
      rankedTurnGoals: rawModelTurnGoals.length ? rawModelTurnGoals : feedbackAwareFallbackHumanContext.rankedTurnGoals,
    },
  );

  const topics = normalizeTopics(
    payload.topics,
    hardFloorScenario ? heuristic.topics : [],
    primaryScenario,
    primaryIntent,
    riskLevel,
  );
  const normalizedHumanContext = normalizeHumanContext(
    payload.humanContext,
    modelCompatibilityFallbackHumanContext,
    dto.message,
  );
  const hasCurrentTurnHardScenarioEvidence = Boolean(hardFloorScenario);
  const resolvedModelGoalHumanContext = alignCustomerServiceHumanContextWithResolvedModelCurrentGoal(
    normalizedHumanContext,
    rawModelCurrentGoal,
  );
  const settledClosureAlignedHumanContext = alignHumanContextWithSettledAcceptedClosure(
    resolvedModelGoalHumanContext,
    rawModelCurrentGoal,
    rawModelTurnGoals,
    resolveCustomerServiceDialogueFeedbackEvidence(
      asRecord(payload.humanContext).dialogueFeedbackSignal,
      dto.message,
    ),
    resolveCustomerServiceFeedbackOwnershipEvidence(payload, dto.message),
    dto.message,
    previousAssistantText,
    hasCurrentTurnHardScenarioEvidence,
  );
  // Scenario is context, not a second semantic judge. Only an independent hard floor
  // may override an evidence-bound current goal; ordinary business scenarios never do.
  const hardFloorAlignedHumanContext = hardFloorScenario
    ? alignHumanContextWithScenarioContract(
        settledClosureAlignedHumanContext,
        feedbackAwareFallbackHumanContext,
        primaryScenario,
        primaryIntent,
        dto.message,
        true,
      )
    : settledClosureAlignedHumanContext;
  const alignedHumanContext = alignHumanContextWithConversationTask(
    hardFloorAlignedHumanContext,
    dto.message,
  );
  const humanContext = synchronizeRequiredResponseContract(
    alignedHumanContext,
    rawModelTurnGoals,
  );
  const intentRanking = normalizeIntentRanking(payload.intentRanking, {
    primaryScenario,
    primaryIntent,
    message: dto.message,
    conversationTaskState: finalTaskState,
  });
  const recognizedItems = normalizeRecognizedItems(
    payload.recognizedItems,
    [],
    catalog,
    { primaryScenario, primaryIntent, riskLevel, message: dto.message },
  );
  const namedOfferingMentionSpans = resolveCustomerServiceNamedOfferingMentionSpans(
    payload.namedOfferingMentionSpans,
    dto.message,
  );
  const source = heuristic.source === 'MANUAL' ? 'MANUAL' : 'MODEL_ASSISTED';
  const factOwnership = resolveCustomerServiceFactOwnershipFromTypedTurnGoals(rawModelTurnGoals)
    || heuristic.factOwnership;

  return {
    ...heuristic,
    source,
    namedOfferingMentionSpans,
    factOwnership,
    contextualReferentSelection: resolveCustomerServiceContextualReferentSelection(
      payload.contextualReferentSignal,
      dto.message,
      readCustomerServiceConversationStateV2(dto.conversationState),
    ),
    primaryScenario,
    primaryIntent,
    riskLevel,
    emotion,
    topics,
    intentRanking,
    recognizedItems,
    humanContext,
    requiresHumanReview:
      riskLevel === 'HIGH'
      || riskLevel === 'CRITICAL'
      || primaryScenario === 'COMPLAINT_ESCALATION'
      || primaryScenario === 'SAFETY_SENSITIVE',
    confidence: source === 'MANUAL' ? 1 : calibrateRecognitionConfidence({
      modelConfidence,
      primaryScenario,
      primaryIntent,
    }),
    reasons: uniqueStrings([
      `分类来源：${source}`,
      `主场景：${primaryScenario}`,
      `主意图：${primaryIntent}`,
      `风险等级：${riskLevel}`,
      `对话阶段：${humanContext.interactionStrategy.phase}`,
      `主要动机：${humanContext.primaryMotive}`,
      `识别结果：${intentRanking.length} 个排序意图、${recognizedItems.filter((item) => item.type === 'EVENT').length} 个事件。`,
      `本轮第一目标：${humanContext.dominantTurnGoal.name}。`,
    ]),
  };
}

export function projectCustomerServiceValidModelCompatibilityContext(
  fallback: CustomerServiceHumanContext,
  typed: {
    primaryMotive: CustomerServicePrimaryMotive;
    commercialOpenness: CustomerServiceCommercialOpenness;
    dominantTurnGoal: CustomerServiceTurnGoal;
    rankedTurnGoals: CustomerServiceTurnGoal[];
  },
): CustomerServiceHumanContext {
  // This projection exists only after validateRecognitionPayload() accepted a model
  // envelope. It supplies legacy strategy fields that the compact recognition schema
  // intentionally omits. Every decision below is a finite mapping from typed enums;
  // raw customer wording, punctuation and lexical patterns are not inspected here.
  const goal = typed.dominantTurnGoal;
  const stage = resolveCustomerServiceTypedCommercialStage(goal, typed.commercialOpenness);
  const mentionPolicy = resolveCustomerServiceTypedProductMentionPolicy(stage);
  const interaction = resolveCustomerServiceTypedInteractionProjection(goal, stage);
  const replyMode: CustomerServiceHumanContext['replyStrategy']['mode'] =
    ['PRODUCT_RECOMMENDATION', 'DECISION_SUPPORT', 'LOW_PRESSURE_CLOSE'].includes(stage)
      ? 'PROFESSIONAL_GUIDANCE'
      : goal.requestedContributionKind === 'OTHER'
        ? 'FRIENDLIKE_REACTION'
        : 'DIRECT_ANSWER';
  const compatibilityReason = 'Valid Deep Recognition typed envelope compatibility projection; no raw-wording semantic inference.';

  return {
    ...fallback,
    primaryMotive: typed.primaryMotive,
    commercialOpenness: typed.commercialOpenness,
    commercialOpennessScore: resolveCustomerServiceTypedCommercialOpennessScore(typed.commercialOpenness),
    uncertainties: [],
    commercialStrategy: {
      stage,
      objective: goal.responseRequirement || `完成已验证的 typed Turn Goal：${goal.name}。`,
      discoveryTarget: '由已验证 typed goal 与 Canonical Plan 决定；compatibility projection 不新增开放语言目标。',
      productMentionPolicy: mentionPolicy,
      transitionSignals: [],
      evidence: uniqueStrings(goal.evidence).slice(0, 6),
      reason: compatibilityReason,
    },
    interactionStrategy: {
      ...interaction,
      reason: compatibilityReason,
    },
    emotionStrategy: {
      ...fallback.emotionStrategy,
      reason: compatibilityReason,
    },
    replyStrategy: {
      mode: replyMode,
      primaryMove: goal.responseRequirement || `完成已验证的 typed Turn Goal：${goal.name}。`,
      secondaryMoves: [],
      continuation: 'WAIT_FOR_CUSTOMER',
      valueGoal: goal.responseRequirement || goal.name,
      mustInclude: [],
      avoid: [],
      reason: compatibilityReason,
    },
    semanticMoveBudget: {
      maxCoreMoves: goal.requestedContributionKind === 'OTHER' ? 1 : 2,
      allowedMoves: [goal.responseRequirement || `完成已验证的 typed Turn Goal：${goal.name}。`],
      forbiddenCombinations: ['从 raw wording、标点或词面模式新增未授权业务语义'],
      reason: compatibilityReason,
    },
    dominantTurnGoal: goal,
    rankedTurnGoals: typed.rankedTurnGoals,
  };
}

function resolveCustomerServiceTypedCommercialOpennessScore(openness: CustomerServiceCommercialOpenness) {
  switch (openness) {
    case 'EXPLICIT': return 95;
    case 'ACTIVE': return 80;
    case 'LATENT': return 45;
    case 'CLOSED': return 0;
    default: return 0;
  }
}

function resolveCustomerServiceTypedCommercialStage(
  goal: CustomerServiceTurnGoal,
  openness: CustomerServiceCommercialOpenness,
): CustomerServiceCommercialStage {
  if (openness === 'CLOSED') return 'NO_COMMERCIAL_MOVE';
  switch (goal.key) {
    case 'EXPLORE_PRODUCT_NEED': return 'PRODUCT_RECOMMENDATION';
    case 'SUPPORT_PURCHASE_DECISION': return 'DECISION_SUPPORT';
    case 'CONFIRM_TRANSACTION': return 'LOW_PRESSURE_CLOSE';
    case 'DISCOVER_LIFE_CONTEXT': return 'CONTEXT_DISCOVERY';
    case 'MAINTAIN_RELATIONSHIP': return 'RELATIONSHIP_BUILDING';
    default:
      return goal.requestedContributionKind === 'DECISION_SUPPORT'
        && goal.requestedEvidenceScope === 'MERCHANT_BUSINESS'
        ? 'DECISION_SUPPORT'
        : 'NO_COMMERCIAL_MOVE';
  }
}

function resolveCustomerServiceTypedProductMentionPolicy(
  stage: CustomerServiceCommercialStage,
): CustomerServiceProductMentionPolicy {
  if (stage === 'PRODUCT_RECOMMENDATION') return 'SPECIFIC_IF_RELEVANT';
  if (stage === 'DECISION_SUPPORT' || stage === 'LOW_PRESSURE_CLOSE') return 'SPECIFIC_ALLOWED';
  return 'PROHIBITED';
}

function resolveCustomerServiceTypedInteractionProjection(
  goal: CustomerServiceTurnGoal,
  stage: CustomerServiceCommercialStage,
): Omit<CustomerServiceHumanContext['interactionStrategy'], 'reason'> {
  if (stage === 'PRODUCT_RECOMMENDATION' || stage === 'DECISION_SUPPORT') {
    return { phase: 'DECISION', firstMove: 'SUPPORT_DECISION', commercialTiming: 'ASSIST_NOW' };
  }
  if (stage === 'LOW_PRESSURE_CLOSE') {
    return { phase: 'CLOSING', firstMove: 'CONFIRM_OR_CLOSE', commercialTiming: 'ASSIST_NOW' };
  }
  if (stage === 'CONTEXT_DISCOVERY') {
    return { phase: 'OPENING', firstMove: 'DISCOVER_CONTEXT', commercialTiming: 'WAIT_FOR_CONTEXT' };
  }
  if (stage === 'RELATIONSHIP_BUILDING') {
    return { phase: 'OPENING', firstMove: 'RESPOND_TO_SHARED_CONTEXT', commercialTiming: 'HOLD' };
  }
  if (goal.requestedContributionKind === 'ACTION'
    || goal.requestedContributionKind === 'INFORMATION'
    || goal.requestedContributionKind === 'ADVICE') {
    return { phase: 'SERVICE', firstMove: 'SOLVE_CURRENT_ISSUE', commercialTiming: 'HOLD' };
  }
  return { phase: 'OPENING', firstMove: 'RESPOND_TO_SHARED_CONTEXT', commercialTiming: 'HOLD' };
}

function resolveCustomerServiceNamedOfferingMentionSpans(value: unknown, latestMessage: string) {
  const message = String(latestMessage || '');
  if (!message) return [];
  const result: string[] = [];
  for (const raw of asArray(value)) {
    if (typeof raw !== 'string') continue;
    const span = raw.trim();
    if (!span || span.length > 80 || !message.includes(span) || result.includes(span)) continue;
    result.push(span);
    if (result.length >= 4) break;
  }
  return result;
}

function calibrateRecognitionConfidence(input: {
  modelConfidence: number;
  primaryScenario: string;
  primaryIntent: string;
}) {
  if (input.primaryScenario === 'UNKNOWN' || input.primaryIntent === 'UNKNOWN') {
    return Math.min(0.45, Math.max(0.2, input.modelConfidence * 0.5));
  }
  return Math.round(Math.max(0.35, Math.min(0.95, input.modelConfidence)) * 100) / 100;
}

function normalizeTopics(
  value: unknown,
  fallback: CustomerServiceTopic[],
  primaryScenario: string,
  primaryIntent: string,
  riskLevel: CustomerServiceTopic['riskLevel'],
) {
  const result = asArray(value).map((item, index) => {
    const record = asRecord(item);
    const scenario = normalizeModelScenario(record.scenario);
    const rawIntent = normalizeModelPrimaryIntent(record.intent);
    if (!scenario || !rawIntent) return null;
    const intent = canonicalIntentForScenario(scenario, rawIntent);
    return {
      scenario,
      intent,
      riskLevel: normalizeEnum(record.riskLevel, RISK_LEVELS, riskLevel),
      priority: Math.trunc(clampNumber(record.priority, 100 - index, 0, 2000)),
      confidence: clampNumber(record.confidence, 0.65, 0, 1),
      evidence: stringArray(record.evidence, 6),
    } satisfies CustomerServiceTopic;
  }).filter((item): item is CustomerServiceTopic => Boolean(item));
  const merged = result.length ? result : fallback;
  const primaryIndex = merged.findIndex((item) => item.scenario === primaryScenario && item.intent === primaryIntent);
  if (primaryIndex < 0) {
    merged.unshift({ scenario: primaryScenario, intent: primaryIntent, riskLevel, priority: 2000, confidence: 0.75, evidence: ['当前主任务'] });
  } else if (primaryIndex > 0) {
    const [primary] = merged.splice(primaryIndex, 1);
    merged.unshift({ ...primary, riskLevel, priority: Math.max(primary.priority, 2000), evidence: uniqueStrings(['当前主任务', ...primary.evidence]) });
  }
  return uniqueBy(merged, (item) => `${item.scenario}|${item.intent}`).slice(0, 5);
}


function normalizeIntentRanking(
  value: unknown,
  context: { primaryScenario: string; primaryIntent: string; message: string; conversationTaskState: CustomerServiceHumanContext['conversationTaskState'] },
): CustomerServiceIntentHypothesis[] {
  const modelItems = asArray(value).map((item, index) => {
    const record = asRecord(item);
    const scenario = normalizeModelScenario(record.scenario);
    const rawIntent = normalizeModelPrimaryIntent(record.intent);
    if (!scenario || !rawIntent) return null;
    const intent = canonicalIntentForScenario(scenario, rawIntent);
    return {
      key: normalizeString(record.key, `${scenario.toLowerCase()}:${intent.toLowerCase()}`, 160),
      name: normalizeString(record.name, `${scenario} / ${intent}`, 160),
      scenario,
      intent,
      role: normalizeEnum(record.role, INTENT_ROLES, index === 0 ? 'PRIMARY' : 'SECONDARY'),
      scope: normalizeEnum(record.scope, RECOGNITION_SCOPES, 'TURN'),
      continuity: normalizeEnum(record.continuity, RECOGNITION_CONTINUITIES, 'NEW'),
      confidence: clampNumber(record.confidence, 0.65, 0, 1),
      priority: Math.trunc(clampNumber(record.priority, 1000 - index, 0, 5000)),
      evidence: stringArray(record.evidence, 8),
      reason: normalizeString(record.reason, 'Deep Recognition typed intent projection.', 1000),
      actionable: normalizeEnum(record.role, INTENT_ROLES, index === 0 ? 'PRIMARY' : 'SECONDARY') === 'LATENT'
        ? record.actionable === true : record.actionable !== false,
    } satisfies CustomerServiceIntentHypothesis;
  }).filter((item): item is CustomerServiceIntentHypothesis => Boolean(item));

  const deduplicated: CustomerServiceIntentHypothesis[] = [];
  for (const item of modelItems) {
    const existing = deduplicated.find((entry) => entry.scenario === item.scenario && entry.intent === item.intent);
    if (!existing) { deduplicated.push(item); continue; }
    existing.confidence = Math.max(existing.confidence, item.confidence);
    existing.priority = Math.max(existing.priority, item.priority);
    existing.evidence = uniqueStrings([...existing.evidence, ...item.evidence]);
    existing.actionable = existing.actionable || item.actionable;
  }
  if (!deduplicated.some((item) => item.scenario === context.primaryScenario && item.intent === context.primaryIntent)) {
    deduplicated.push({
      key: `${context.primaryScenario.toLowerCase()}:${context.primaryIntent.toLowerCase()}`,
      name: `${context.primaryScenario} / ${context.primaryIntent}`,
      scenario: context.primaryScenario,
      intent: context.primaryIntent,
      role: 'PRIMARY',
      scope: 'TURN',
      continuity: context.conversationTaskState.currentTurnRelation === 'NEW_REQUEST' ? 'NEW' : 'CONTINUING',
      confidence: 0.65,
      priority: 2000,
      evidence: [],
      reason: 'Primary typed envelope projection.',
      actionable: true,
    });
  }
  const primary = deduplicated.find((item) => item.scenario === context.primaryScenario && item.intent === context.primaryIntent)!;
  primary.role = 'PRIMARY';
  primary.actionable = true;
  primary.priority = Math.max(primary.priority, 2000);
  return deduplicated.sort((a, b) => {
    if (a === primary) return -1;
    if (b === primary) return 1;
    return intentRoleRank(a.role) - intentRoleRank(b.role) || b.priority - a.priority || b.confidence - a.confidence;
  }).slice(0, 8).map((item, index) => ({
    ...item,
    role: index === 0 ? 'PRIMARY' as const : item.role === 'LATENT' ? 'LATENT' as const : 'SECONDARY' as const,
  }));
}

function intentRoleRank(role: CustomerServiceIntentHypothesis['role']) { return role === 'PRIMARY' ? 0 : role === 'SECONDARY' ? 1 : 2; }

function normalizeHumanContext(
  value: unknown,
  fallback: CustomerServiceHumanContext,
  latestMessage = '',
): CustomerServiceHumanContext {
  const record = asRecord(value);
  const interaction = asRecord(record.interactionStrategy);
  const emotion = asRecord(record.emotionStrategy);
  const reply = asRecord(record.replyStrategy);
  const semanticBudget = asRecord(record.semanticMoveBudget);
  const commercialStrategy = asRecord(record.commercialStrategy);
  const rankedTurnGoals = normalizeTurnGoals(record.rankedTurnGoals, fallback.rankedTurnGoals);
  const dominantTurnGoal = resolveCustomerServiceRecognizedDominantTurnGoal(
    record.dominantTurnGoal,
    rankedTurnGoals,
    fallback.dominantTurnGoal,
    latestMessage,
  );
  const normalizedPhase = normalizeEnum(interaction.phase, PHASES, fallback.interactionStrategy.phase);
  const normalizedBudget = normalizeSemanticMoveBudget(semanticBudget, fallback.semanticMoveBudget, normalizedPhase);
  const normalizedOpenness = normalizeEnum(record.commercialOpenness, OPENNESS, fallback.commercialOpenness);
  const normalizedCommercialStrategy = normalizeCommercialStrategy(commercialStrategy, fallback.commercialStrategy, normalizedOpenness);
  const normalized: CustomerServiceHumanContext = {
    primaryMotive: normalizeEnum(record.primaryMotive, MOTIVES, fallback.primaryMotive),
    secondaryMotives: uniqueEnumArray(record.secondaryMotives, MOTIVES, fallback.secondaryMotives).filter((item) => item !== normalizeEnum(record.primaryMotive, MOTIVES, fallback.primaryMotive)),
    mindset: normalizeEnum(record.mindset, MINDSETS, fallback.mindset),
    relationshipState: normalizeEnum(record.relationshipState, RELATIONSHIPS, fallback.relationshipState),
    conversationStance: normalizeEnum(record.conversationStance, CONVERSATION_STANCES, fallback.conversationStance),
    commercialOpenness: normalizedOpenness,
    commercialOpennessScore: Math.round(clampNumber(record.commercialOpennessScore, fallback.commercialOpennessScore, 0, 100)),
    commercialStrategy: normalizedCommercialStrategy,
    statedNeeds: stringArray(record.statedNeeds, 8, fallback.statedNeeds),
    inferredNeeds: stringArray(record.inferredNeeds, 8, fallback.inferredNeeds),
    valueOpportunities: stringArray(record.valueOpportunities, 8, fallback.valueOpportunities),
    evidence: stringArray(record.evidence, 10, fallback.evidence),
    uncertainties: stringArray(record.uncertainties, 8, fallback.uncertainties),
    emotionalDisclosure: fallback.emotionalDisclosure,
    interactionStrategy: {
      phase: normalizedPhase,
      firstMove: normalizeEnum(interaction.firstMove, FIRST_MOVES, fallback.interactionStrategy.firstMove),
      commercialTiming: normalizeEnum(interaction.commercialTiming, TIMINGS, fallback.interactionStrategy.commercialTiming),
      reason: normalizeString(interaction.reason, fallback.interactionStrategy.reason, 800),
    },
    emotionStrategy: {
      posture: normalizeEnum(emotion.posture, POSTURES, fallback.emotionStrategy.posture),
      warmth: Math.round(clampNumber(emotion.warmth, fallback.emotionStrategy.warmth, 0, 100)),
      playfulness: Math.round(clampNumber(emotion.playfulness, fallback.emotionStrategy.playfulness, 0, 100)),
      validationPriority: Math.round(clampNumber(emotion.validationPriority, fallback.emotionStrategy.validationPriority, 0, 100)),
      solutionPriority: Math.round(clampNumber(emotion.solutionPriority, fallback.emotionStrategy.solutionPriority, 0, 100)),
      emojiPolicy: normalizeEnum(emotion.emojiPolicy, ['ALLOW_ONE', 'NEUTRAL', 'AVOID'] as const, fallback.emotionStrategy.emojiPolicy),
      relationshipDistance: normalizeEnum(emotion.relationshipDistance, ['FORMAL', 'FRIENDLY', 'FAMILIAR', 'REPAIR'] as const, fallback.emotionStrategy.relationshipDistance),
      guidance: stringArray(emotion.guidance, 8, fallback.emotionStrategy.guidance),
      forbiddenTone: stringArray(emotion.forbiddenTone, 8, fallback.emotionStrategy.forbiddenTone),
      reason: normalizeString(emotion.reason, fallback.emotionStrategy.reason, 800),
    },
    replyStrategy: {
      mode: normalizeEnum(reply.mode, REPLY_MODES, fallback.replyStrategy.mode),
      primaryMove: normalizeString(reply.primaryMove, fallback.replyStrategy.primaryMove, 1000),
      secondaryMoves: stringArray(reply.secondaryMoves, 8, fallback.replyStrategy.secondaryMoves),
      continuation: normalizeEnum(reply.continuation, REPLY_CONTINUATIONS, fallback.replyStrategy.continuation),
      valueGoal: normalizeString(reply.valueGoal, fallback.replyStrategy.valueGoal, 1000),
      mustInclude: stringArray(reply.mustInclude, 8, fallback.replyStrategy.mustInclude),
      avoid: stringArray(reply.avoid, 12, fallback.replyStrategy.avoid),
      reason: normalizeString(reply.reason, fallback.replyStrategy.reason, 1000),
    },
    semanticMoveBudget: normalizedBudget,
    dominantTurnGoal,
    rankedTurnGoals,
    requiredTurnGoals: fallback.requiredTurnGoals,
    requiredResponseActs: fallback.requiredResponseActs,
    conversationTaskState: fallback.conversationTaskState,
    dialogueObligation: fallback.dialogueObligation,
    stateTruthSignal: fallback.stateTruthSignal,
  };
  return alignHumanContextWithDominantGoal(normalized);
}


function normalizeTurnGoals(
  value: unknown,
  fallback: CustomerServiceTurnGoal[],
): CustomerServiceTurnGoal[] {
  // Root-Cause First Authority boundary: once Deep Recognition returned a valid
  // typed goal envelope, lexical/local heuristic goals are no longer positive
  // semantic candidates. They remain available only as the bounded fallback for
  // model-unavailable/invalid paths. Mixing fallback goals into a valid model
  // envelope recreates a second semantic owner after recognition.
  const rawGoals = asArray(value);
  const merged: CustomerServiceTurnGoal[] = [];
  for (const raw of rawGoals) {
    const record = asRecord(raw);
    const key = normalizeEnum(record.key, TURN_GOAL_KEYS, null);
    if (!key) continue;
    const requestedContributionKind = normalizeEnum(record.requestedContributionKind, REQUESTED_CONTRIBUTION_KINDS, null);
    const requestedEvidenceScope = normalizeEnum(record.requestedEvidenceScope, REQUESTED_EVIDENCE_SCOPES, null);
    const requestedDecisionMode = normalizeEnum(record.requestedDecisionMode, REQUESTED_DECISION_MODES, null);
    const requestedAnswerFocus = normalizeEnum(record.requestedAnswerFocus, REQUESTED_ANSWER_FOCUSES, null);
    const item: CustomerServiceTurnGoal = {
      key,
      requestedContributionKind: requestedContributionKind || undefined,
      requestedEvidenceScope: requestedEvidenceScope || undefined,
      requestedDecisionMode: requestedDecisionMode || undefined,
      requestedAnswerFocus: requestedAnswerFocus || undefined,
      name: normalizeString(record.name, turnGoalName(key), 160),
      priority: Math.trunc(clampNumber(record.priority, 500, 0, 5000)),
      confidence: clampNumber(record.confidence, 0.65, 0, 1),
      evidence: normalizeCustomerServiceRecognitionEvidence(record.evidence, 8),
      reason: normalizeString(record.reason, '模型结合上下文识别出的本轮目标。', 1000),
      responseRequirement: normalizeString(record.responseRequirement, '回复应完成该目标。', 1000),
      source: normalizeEnum(record.source, TURN_GOAL_SOURCES, 'MODEL'),
      deferred: record.deferred === true,
    };
    const existing = merged.find((entry) => customerServiceTurnGoalSemanticIdentity(entry) === customerServiceTurnGoalSemanticIdentity(item));
    if (!existing) { merged.push(item); continue; }
    if (item.requestedContributionKind) existing.requestedContributionKind = item.requestedContributionKind;
    if (item.requestedEvidenceScope) existing.requestedEvidenceScope = item.requestedEvidenceScope;
    if (item.requestedDecisionMode) existing.requestedDecisionMode = item.requestedDecisionMode;
    if (item.requestedAnswerFocus) existing.requestedAnswerFocus = item.requestedAnswerFocus;
    existing.priority = Math.max(existing.priority, item.priority);
    existing.confidence = Math.max(existing.confidence, item.confidence);
    existing.evidence = uniqueStrings([...existing.evidence, ...item.evidence]);
    if (item.reason) existing.reason = item.reason;
    if (item.responseRequirement) existing.responseRequirement = item.responseRequirement;
    existing.deferred = existing.deferred && item.deferred;
  }
  const source = merged.length
    ? merged
    : fallback.map((item) => ({ ...item, evidence: [...item.evidence] }));
  return uniqueBy(source, customerServiceTurnGoalSemanticIdentity)
    .sort((a, b) => Number(a.deferred) - Number(b.deferred) || b.priority - a.priority || b.confidence - a.confidence)
    .slice(0, 8);
}

export function resolveCustomerServiceRecognizedDominantTurnGoal(
  value: unknown,
  ranked: CustomerServiceTurnGoal[],
  fallback: CustomerServiceTurnGoal,
  latestMessage = '',
) {
  const top = ranked.find((item) => !item.deferred) || ranked[0] || fallback;
  const requestedRecord = asRecord(value);
  const requestedKey = normalizeEnum(requestedRecord.key, TURN_GOAL_KEYS, null);
  const requestedContributionKind = normalizeEnum(requestedRecord.requestedContributionKind, REQUESTED_CONTRIBUTION_KINDS, null);
  const requestedEvidenceScope = normalizeEnum(requestedRecord.requestedEvidenceScope, REQUESTED_EVIDENCE_SCOPES, null);
  const requestedDecisionMode = normalizeEnum(requestedRecord.requestedDecisionMode, REQUESTED_DECISION_MODES, null);
  const requestedAnswerFocus = normalizeEnum(requestedRecord.requestedAnswerFocus, REQUESTED_ANSWER_FOCUSES, null);
  const requested = requestedKey ? ranked.find((item) => (
    item.key === requestedKey
    && (!requestedContributionKind || item.requestedContributionKind === requestedContributionKind)
    && (!requestedEvidenceScope || item.requestedEvidenceScope === requestedEvidenceScope)
    && (!requestedDecisionMode || item.requestedDecisionMode === requestedDecisionMode)
    && (!requestedAnswerFocus || item.requestedAnswerFocus === requestedAnswerFocus)
    && !item.deferred
  )) : null;

  // R0 Current-Turn Semantic Authority Convergence:
  // a high-confidence, evidence-bound semantic operation from the latest customer
  // turn outranks stale scenario/state priority. This is one generic source-
  // precedence rule for current semantic obligations; CLOSE/SUMMARY/CORRECTION
  // must not each grow their own override branch. Relationship/opening/discovery
  // posture is deliberately excluded from this authority set.
  if (requested && CURRENT_TURN_AUTHORITATIVE_GOALS.has(requested.key)) {
    const requestedConfidence = clampNumber(requestedRecord.confidence, requested.confidence, 0, 1);
    const requestedEvidence = stringArray(requestedRecord.evidence, 4);
    const evidenceBound = hasVerbatimCurrentTurnEvidence(requestedEvidence, latestMessage);
    if (requestedConfidence >= 0.82 && evidenceBound) return requested;
  }

  return requested && requested.priority >= top.priority - 40 ? requested : top;
}

function hasVerbatimCurrentTurnEvidence(evidence: string[], latestMessage: string) {
  const message = latestMessage.trim();
  if (!message) return false;
  return evidence.some((item) => {
    const span = item.trim();
    return span.length >= 2 && message.includes(span);
  });
}

function hasAuthoritativeCurrentTurnGoal(goal: CustomerServiceTurnGoal | null | undefined, latestMessage: string) {
  return Boolean(
    goal
    && !goal.deferred
    && CURRENT_TURN_AUTHORITATIVE_GOALS.has(goal.key)
    && goal.confidence >= 0.82
    && hasVerbatimCurrentTurnEvidence(goal.evidence || [], latestMessage),
  );
}

function alignHumanContextWithConversationTask(context: CustomerServiceHumanContext, latestMessage = ''): CustomerServiceHumanContext {
  const task = context.conversationTaskState;
  // R0: task lineage is context, not a second current-turn semantic owner. If the
  // latest turn contains a different high-confidence evidence-bound operation,
  // stale pending/provided-slot state cannot replace it with HANDLE/PROCESS.
  if (hasAuthoritativeCurrentTurnGoal(context.dominantTurnGoal, latestMessage)
    && !['HANDLE_INFORMATION_BARRIER', 'PROCESS_PROVIDED_INFORMATION'].includes(context.dominantTurnGoal.key)) {
    return context;
  }
  if (task?.currentTurnRelation === 'INFORMATION_BARRIER' && task.pendingSlots.length) {
    const slotNames = task.pendingSlots.map((item) => item.name).join('、');
    const barrierGoal: CustomerServiceTurnGoal = {
      key: 'HANDLE_INFORMATION_BARRIER',
      name: '处理资料障碍并降低客户负担',
      priority: 1800,
      confidence: 0.96,
      evidence: task.evidence,
      reason: '客户无法或不愿继续提供上一轮索取的信息，并希望客服降低操作负担。',
      responseRequirement: `先承接客户无法提供${slotNames}的现实，再给出唯一、真实且低负担的下一步。`,
      source: 'CONTEXT',
      deferred: false,
    };
    const rankedTurnGoals = [barrierGoal, ...context.rankedTurnGoals
      .filter((item) => !['HANDLE_INFORMATION_BARRIER', 'PROCESS_PROVIDED_INFORMATION'].includes(item.key))
      .map((item) => ['DISCOVER_LIFE_CONTEXT', 'MAINTAIN_RELATIONSHIP'].includes(item.key) ? { ...item, deferred: true } : item)]
      .sort((a, b) => Number(a.deferred) - Number(b.deferred) || b.priority - a.priority);
    return {
      ...context,
      primaryMotive: 'PROBLEM_RESOLUTION',
      commercialOpenness: 'CLOSED',
      commercialOpennessScore: 0,
      commercialStrategy: {
        stage: 'NO_COMMERCIAL_MOVE', objective: '降低客户资料操作负担并继续原服务任务。', discoveryTarget: '无',
        productMentionPolicy: 'PROHIBITED', transitionSignals: ['当前服务问题完成或客户主动切换新话题'],
        evidence: task.evidence, reason: '资料障碍属于原服务任务的一部分，优先于闲聊和经营信号。',
      },
      interactionStrategy: {
        phase: 'SERVICE', firstMove: 'HANDLE_INFORMATION_BARRIER', commercialTiming: 'HOLD',
        reason: '客户无法或拒绝继续提供上一轮索取的信息，应先降低操作负担并说明一个真实下一步。',
      },
      replyStrategy: {
        mode: 'ACCOUNTABLE_RESOLUTION', primaryMove: `承接客户无法提供${slotNames}的现实，并说明一个低负担的下一步。`,
        secondaryMoves: ['不得假装已经收到字段', '确实仍缺信息时最多只补问一项'], continuation: 'NEXT_SERVICE_STEP',
        valueGoal: '让客户知道资料障碍已被理解，不会被机械地重复索取。', mustInclude: ['资料障碍承接', '唯一下一步'],
        avoid: ['把无法提供误判为已经提供', '重复索取同一字段', '自行写死未配置查询路径'], reason: barrierGoal.reason,
      },
      semanticMoveBudget: {
        maxCoreMoves: 2, allowedMoves: ['承接客户资料障碍或操作负担', '给出一个真实、低负担的下一步'],
        forbiddenCombinations: ['重复索取同一字段', '同时提供多个替代路径', '写死未配置的权限'],
        reason: '本轮只需要降低负担并推进一个下一步。',
      },
      dominantTurnGoal: barrierGoal,
      rankedTurnGoals,
    };
  }
  if (!task || task.status !== 'READY_TO_ADVANCE' || !task.providedSlots.length) return context;
  const slotNames = task.providedSlots.map((item) => item.name).join('、');
  const processGoal: CustomerServiceTurnGoal = {
    key: 'PROCESS_PROVIDED_INFORMATION',
    name: '处理客户已补充的信息',
    priority: 1800,
    confidence: Math.max(...task.providedSlots.map((item) => item.confidence), 0.9),
    evidence: task.evidence,
    reason: '客户本轮正在回答上一轮客服索取的关键信息。',
    responseRequirement: `确认已收到${slotNames}并推进原任务，不得再次索取相同信息。`,
    source: 'CONTEXT',
    deferred: false,
  };
  const rankedTurnGoals = [processGoal, ...context.rankedTurnGoals
    .filter((item) => item.key !== 'PROCESS_PROVIDED_INFORMATION')
    .map((item) => ['DISCOVER_LIFE_CONTEXT', 'MAINTAIN_RELATIONSHIP'].includes(item.key) ? { ...item, deferred: true } : item)]
    .sort((a, b) => Number(a.deferred) - Number(b.deferred) || b.priority - a.priority);
  return {
    ...context,
    primaryMotive: 'PROBLEM_RESOLUTION',
    commercialOpenness: 'CLOSED',
    commercialOpennessScore: 0,
    commercialStrategy: {
      stage: 'NO_COMMERCIAL_MOVE', objective: '继续处理客户已经补充资料的原服务任务。', discoveryTarget: '无',
      productMentionPolicy: 'PROHIBITED', transitionSignals: ['当前服务问题已经完成或客户主动切换新话题'],
      evidence: task.evidence, reason: '请求—回答关系优先于闲聊和经营信号。',
    },
    interactionStrategy: {
      phase: 'SERVICE', firstMove: 'PROCESS_PROVIDED_INFORMATION', commercialTiming: 'HOLD',
      reason: '客户已提供上一轮索取的关键信息，应从原服务流程的下一节点继续。',
    },
    replyStrategy: {
      mode: 'CALM_PROGRESS_UPDATE', primaryMove: `确认已收到${slotNames}并继续原任务。`,
      secondaryMoves: ['不得重复索取同一字段', '字段无效时必须说明具体格式问题'], continuation: 'NEXT_SERVICE_STEP',
      valueGoal: '让客户知道补充资料已被接收并推动处理继续。', mustInclude: ['已收到补充信息', '下一处理节点'],
      avoid: ['重复询问同一字段', '重新回到问题开场', '关系闲聊或商品探索'], reason: processGoal.reason,
    },
    semanticMoveBudget: {
      maxCoreMoves: 2, allowedMoves: ['确认已收到客户补充的信息', '推进原服务任务的下一节点'],
      forbiddenCombinations: ['已提供字段 + 再次索取同一字段', '补充资料 + 重新询问原问题', '服务未完成 + 闲聊或销售'],
      reason: '客户已经回答上一轮问题，本轮只能确认接收并推进流程。',
    },
    dominantTurnGoal: processGoal,
    rankedTurnGoals,
  };
}


/**
 * Consume the already-resolved Deep Recognition current goal in the existing
 * HumanContext Authority. This closes the gap where dominantTurnGoal said CLOSE
 * while rankedTurnGoals from the same model call still contained the evidence-
 * owned current obligation selected by resolveCustomerServiceModelCurrentTurnGoal.
 */
export function alignCustomerServiceHumanContextWithResolvedModelCurrentGoal(
  context: CustomerServiceHumanContext,
  resolvedGoal: CustomerServiceTurnGoal | null,
): CustomerServiceHumanContext {
  if (!resolvedGoal) return context;
  const resolvedIdentity = customerServiceTurnGoalSemanticIdentity(resolvedGoal);
  const rankedGoal = context.rankedTurnGoals.find((item) => customerServiceTurnGoalSemanticIdentity(item) === resolvedIdentity);
  const currentGoal: CustomerServiceTurnGoal = {
    ...(rankedGoal || resolvedGoal),
    priority: Math.max(rankedGoal?.priority || 0, resolvedGoal.priority),
    confidence: Math.max(rankedGoal?.confidence || 0, resolvedGoal.confidence),
    evidence: uniqueStrings([...(rankedGoal?.evidence || []), ...resolvedGoal.evidence]),
    source: 'MODEL',
    deferred: false,
  };
  return alignHumanContextWithDominantGoal({
    ...context,
    dominantTurnGoal: currentGoal,
    rankedTurnGoals: [
      currentGoal,
      ...context.rankedTurnGoals.filter((item) => customerServiceTurnGoalSemanticIdentity(item) !== resolvedIdentity),
    ],
  });
}

/**
 * P0-3 R2 Final: DialogueObligation already owns the structured fact that the
 * customer accepted the immediately previous contribution. When that accepted
 * turn carries no separately evidenced current obligation, current hard risk,
 * required input, correction, or requested delta, compile that fact into the
 * existing CLOSE_CONVERSATION goal. This is current-turn Authority convergence,
 * not a text/role/domain close detector and not a new planning layer.
 */
export function shouldConvergeCustomerServiceSettledAcceptanceToClosure(input: {
  context: CustomerServiceHumanContext;
  rawModelCurrentGoal: CustomerServiceTurnGoal | null;
  rawModelTurnGoals?: CustomerServiceTurnGoal[];
  dialogueFeedbackEvidence?: string | null;
  feedbackOwnershipEvidence?: string[];
  latestMessage: string;
  previousAssistantText: string;
  hasCurrentTurnHardScenarioEvidence: boolean;
}) {
  const latestMessage = input.latestMessage.trim();
  const obligation = input.context.dialogueObligation;
  if (!latestMessage || !input.previousAssistantText.trim()) return false;
  if (input.hasCurrentTurnHardScenarioEvidence) return false;
  if (obligation.userFeedback !== 'ACCEPTED'
    || !['EXPLICIT', 'MODEL'].includes(obligation.source)
    || obligation.confidence < 0.72
    || obligation.requestedDeltas.length > 0
    || obligation.strategyChangeRequired
    || obligation.repairObligation
    || Boolean(obligation.unresolvedNeed)) return false;
  if (input.context.conversationTaskState.pendingSlots
    .some((slot) => ['MISSING', 'REQUESTED'].includes(slot.status))) return false;

  // DialogueFeedback owns only reception of the previous contribution. A close
  // may follow either an explicit current CLOSE goal or a structurally equivalent
  // reception-only goal set whose complete evidence is already owned by the same
  // accepted-feedback span. A separately evidenced answer/action/share remains a
  // current obligation and can never be erased here.
  const explicitCurrentClose = input.rawModelCurrentGoal?.key === 'CLOSE_CONVERSATION'
    && hasAuthoritativeCurrentTurnGoal(input.rawModelCurrentGoal, latestMessage);
  const rawModelTurnGoals = input.rawModelTurnGoals || [];
  const feedbackOwnershipEvidence = uniqueStrings([
    input.dialogueFeedbackEvidence || '',
    ...(input.feedbackOwnershipEvidence || []),
  ]);
  const rawReceptionOnly = rawModelTurnGoals.length > 0
    && rawModelTurnGoals.every((goal) => RECEPTION_ONLY_TURN_GOALS.has(goal.key))
    && rawModelTurnGoals.every((goal) => isGoalEvidenceOwnedByFeedback(goal, feedbackOwnershipEvidence));
  const feedbackOwnedReceptionOnly = !input.rawModelCurrentGoal
    && (rawReceptionOnly || (!rawModelTurnGoals.length
      && isFeedbackOwnedReceptionOnlyTurn(input.context, feedbackOwnershipEvidence, latestMessage)));
  if (!explicitCurrentClose && !feedbackOwnedReceptionOnly) return false;
  if (input.context.dominantTurnGoal.key !== 'CLOSE_CONVERSATION'
    && input.context.dominantTurnGoal.source === 'EXPLICIT'
    && hasAuthoritativeCurrentTurnGoal(input.context.dominantTurnGoal, latestMessage)) return false;
  return true;
}

function isFeedbackOwnedReceptionOnlyTurn(
  context: CustomerServiceHumanContext,
  feedbackOwnershipEvidence: string[],
  latestMessage: string,
) {
  if (!feedbackOwnershipEvidence.length || !latestMessage.trim()) return false;
  const activeGoals = context.rankedTurnGoals.filter((goal) => !goal.deferred);
  const goals = activeGoals.length ? activeGoals : [context.dominantTurnGoal];
  if (!goals.length || !goals.some((goal) => goal.key === context.dominantTurnGoal.key)) return false;
  return goals.every((goal) => {
    if (!RECEPTION_ONLY_TURN_GOALS.has(goal.key)
      || goal.confidence < 0.82
      || !hasVerbatimCurrentTurnEvidence(goal.evidence || [], latestMessage)
      || !(goal.evidence || []).length) return false;
    return isGoalEvidenceOwnedByFeedback(goal, feedbackOwnershipEvidence);
  });
}

function isGoalEvidenceOwnedByFeedback(
  goal: CustomerServiceTurnGoal,
  feedbackOwnershipEvidence: string[],
) {
  const owners = feedbackOwnershipEvidence.map(normalizeEvidenceOwnershipText).filter(Boolean);
  return Boolean((goal.evidence || []).length) && (goal.evidence || []).every((evidence) => {
    const span = normalizeEvidenceOwnershipText(evidence);
    return Boolean(span && owners.some((owner) => owner.includes(span)));
  });
}

function normalizeEvidenceOwnershipText(value: unknown) {
  return String(value || '').replace(/\s+/g, '').trim().toLowerCase();
}

function alignHumanContextWithSettledAcceptedClosure(
  context: CustomerServiceHumanContext,
  rawModelCurrentGoal: CustomerServiceTurnGoal | null,
  rawModelTurnGoals: CustomerServiceTurnGoal[],
  dialogueFeedbackEvidence: string | null,
  feedbackOwnershipEvidence: string[],
  latestMessage: string,
  previousAssistantText: string,
  hasCurrentTurnHardScenarioEvidence: boolean,
): CustomerServiceHumanContext {
  if (!shouldConvergeCustomerServiceSettledAcceptanceToClosure({
    context,
    rawModelCurrentGoal,
    rawModelTurnGoals,
    dialogueFeedbackEvidence,
    feedbackOwnershipEvidence,
    latestMessage,
    previousAssistantText,
    hasCurrentTurnHardScenarioEvidence,
  })) return context;

  const existingCloseGoal = rawModelCurrentGoal?.key === 'CLOSE_CONVERSATION'
    ? rawModelCurrentGoal
    : context.dominantTurnGoal.key === 'CLOSE_CONVERSATION'
      ? context.dominantTurnGoal
      : null;
  const closeGoal: CustomerServiceTurnGoal = {
    ...(existingCloseGoal || {
      key: 'CLOSE_CONVERSATION',
      name: turnGoalName('CLOSE_CONVERSATION'),
      priority: 2000,
      confidence: Math.max(0.9, context.dialogueObligation.confidence),
      evidence: [latestMessage.trim()],
      reason: '客户已接受上一轮贡献，当前轮没有新的证据归属目标、修正、风险或必要输入。',
      responseRequirement: '自然收束当前交流，不重播旧内容，也不重新开启历史任务。',
      source: 'SIGNAL' as const,
      deferred: false,
    }),
    priority: Math.max(existingCloseGoal?.priority || 0, 2000),
    confidence: Math.max(existingCloseGoal?.confidence || 0, context.dialogueObligation.confidence, 0.9),
    evidence: uniqueStrings([...(existingCloseGoal?.evidence || []), latestMessage.trim()]),
    deferred: false,
  };
  const rankedTurnGoals = [
    closeGoal,
    ...context.rankedTurnGoals
      .filter((goal) => goal.key !== 'CLOSE_CONVERSATION')
      .map((goal) => ({ ...goal, deferred: true })),
  ].slice(0, 8);
  return alignHumanContextWithDominantGoal({
    ...context,
    dominantTurnGoal: closeGoal,
    rankedTurnGoals,
  });
}

function alignHumanContextWithScenarioContract(
  context: CustomerServiceHumanContext,
  fallback: CustomerServiceHumanContext,
  scenario: string,
  intent: string,
  latestMessage = '',
  hasCurrentTurnHardScenarioEvidence = false,
): CustomerServiceHumanContext {
  if (context.dialogueObligation.feedbackHandlingMode === 'TRUST_REPAIR') return context;
  // R0: Scenario is continuity/context, not a second current-turn semantic owner.
  // Safety/Security stays hard. Otherwise a high-confidence semantic operation
  // explicitly grounded in the latest customer text keeps the Turn Goal instead
  // of being rewritten by a stale service/product scenario fallback.
  if (shouldPreserveCustomerServiceCurrentTurnGoalAcrossScenario({
    scenario,
    goal: context.dominantTurnGoal,
    latestMessage,
    hasCurrentTurnHardScenarioEvidence,
    settledClosure: context.dominantTurnGoal.key === 'CLOSE_CONVERSATION'
      && context.dialogueObligation.userFeedback === 'ACCEPTED'
      && context.dialogueObligation.requestedDeltas.length === 0
      && context.dialogueObligation.strategyChangeRequired === false
      && !fallback.conversationTaskState.pendingSlots.some((slot) => ['MISSING', 'REQUESTED'].includes(slot.status)),
  })) {
    return alignHumanContextWithDominantGoal(context);
  }
  const task = fallback.conversationTaskState;
  const goalKey = task.currentTurnRelation === 'INFORMATION_BARRIER' && task.pendingSlots.length
    ? 'HANDLE_INFORMATION_BARRIER'
    : task.currentTurnRelation === 'ANSWER_TO_ASSISTANT_REQUEST' && task.providedSlots.length
      ? 'PROCESS_PROVIDED_INFORMATION'
      : scenario === 'COMPLAINT_ESCALATION'
    ? 'REPAIR_TRUST'
    : ['SAFETY_SENSITIVE', 'SECURITY_SENSITIVE', 'AFTER_SALE'].includes(scenario)
      ? 'RESOLVE_CURRENT_PROBLEM'
      : ['REFUND_REQUEST', 'LOGISTICS_DELAY', 'ORDER_STATUS', 'APPOINTMENT'].includes(scenario)
        ? intent === 'REQUEST_ACTION' ? 'EXECUTE_REQUEST' : 'ANSWER_INFORMATION'
        : ['PRODUCT_CONSULT', 'PRODUCT_COMPARE', 'PRICE_HESITATION'].includes(scenario)
          ? intent === 'PURCHASE_INTEREST' ? 'EXPLORE_PRODUCT_NEED' : 'ANSWER_INFORMATION'
          : scenario === 'CASUAL_CHAT'
            && fallback.secondaryMotives.includes('PURCHASE_EXPLORATION')
            && fallback.rankedTurnGoals.some((item) => item.key === 'RESPOND_TO_SHARED_CONTEXT')
            ? 'RESPOND_TO_SHARED_CONTEXT'
          : null;
  if (!goalKey || context.dominantTurnGoal.key === goalKey) return context;
  const fallbackGoal = fallback.rankedTurnGoals.find((item) => item.key === goalKey);
  if (!fallbackGoal) return context;
  const preservedGoal: CustomerServiceTurnGoal = {
    ...fallbackGoal,
    priority: Math.max(fallbackGoal.priority, 1880),
    confidence: Math.max(fallbackGoal.confidence, 0.94),
    source: 'STATE',
    deferred: false,
  };
  return alignHumanContextWithDominantGoal({
    ...context,
    dominantTurnGoal: preservedGoal,
    rankedTurnGoals: [preservedGoal, ...context.rankedTurnGoals.filter((item) => item.key !== goalKey)].slice(0, 8),
  });
}

export function shouldPreserveCustomerServiceCurrentTurnGoalAcrossScenario(input: {
  scenario: string;
  goal: CustomerServiceTurnGoal | null | undefined;
  latestMessage: string;
  hasCurrentTurnHardScenarioEvidence: boolean;
  settledClosure: boolean;
}) {
  if (!hasAuthoritativeCurrentTurnGoal(input.goal, input.latestMessage)) return false;
  const hardScenario = ['SAFETY_SENSITIVE', 'SECURITY_SENSITIVE'].includes(input.scenario);
  return !hardScenario || (input.settledClosure && !input.hasCurrentTurnHardScenarioEvidence);
}

function isCustomerServiceExecutableTypedGoal(goal: CustomerServiceTurnGoal) {
  if (CURRENT_TURN_AUTHORITATIVE_GOALS.has(goal.key)) return true;
  // The new orthogonal contribution axis exists specifically so a compound current
  // obligation is not lost merely because the model's coarse legacy goal key belongs
  // to a posture/discovery family. A typed request for information, decision support,
  // action or advice is independently executable and therefore must survive into
  // requiredTurnGoals. OTHER keeps the legacy key boundary for relationship/reception
  // goals and cannot manufacture an executable task by itself.
  return ['INFORMATION', 'DECISION_SUPPORT', 'ACTION', 'ADVICE']
    .includes(goal.requestedContributionKind || 'OTHER');
}

export function resolveCustomerServiceRequiredTurnGoals(
  context: CustomerServiceHumanContext,
  rawModelTurnGoals: CustomerServiceTurnGoal[],
): CustomerServiceTurnGoal[] {
  // A valid Deep Recognition envelope is the positive current-turn semantic owner.
  // Heuristic/scenario goals remain fallback only when no evidence-bound typed model
  // goal survived validation. `dominantTurnGoal` orders that envelope; it cannot add
  // a second lexical/state obligation or erase another compound obligation.
  const authoritativeModelGoals = rawModelTurnGoals
    .filter((goal) => !goal.deferred && isCustomerServiceExecutableTypedGoal(goal));
  const hasSubstantiveModelGoal = authoritativeModelGoals
    .some((goal) => goal.key !== 'CLOSE_CONVERSATION');

  const required: CustomerServiceTurnGoal[] = [];
  const add = (goal: CustomerServiceTurnGoal | null | undefined) => {
    if (!goal || goal.deferred) return;
    const identity = customerServiceTurnGoalSemanticIdentity(goal);
    if (required.some((item) => customerServiceTurnGoalSemanticIdentity(item) === identity)) return;
    required.push(goal);
  };

  if (authoritativeModelGoals.length) {
    for (const rawGoal of authoritativeModelGoals) {
      if (rawGoal.key === 'CLOSE_CONVERSATION' && hasSubstantiveModelGoal) continue;
      const identity = customerServiceTurnGoalSemanticIdentity(rawGoal);
      const normalizedGoal = context.rankedTurnGoals.find((goal) => customerServiceTurnGoalSemanticIdentity(goal) === identity);
      add(normalizedGoal ? {
        ...normalizedGoal,
        requestedContributionKind: rawGoal.requestedContributionKind || normalizedGoal.requestedContributionKind,
        requestedEvidenceScope: rawGoal.requestedEvidenceScope || normalizedGoal.requestedEvidenceScope,
        requestedDecisionMode: rawGoal.requestedDecisionMode || normalizedGoal.requestedDecisionMode,
        requestedAnswerFocus: rawGoal.requestedAnswerFocus || normalizedGoal.requestedAnswerFocus,
        confidence: Math.max(normalizedGoal.confidence, rawGoal.confidence),
        evidence: uniqueStrings([...rawGoal.evidence, ...normalizedGoal.evidence]),
        source: 'MODEL',
        deferred: false,
      } : rawGoal);
    }
  } else {
    add(context.dominantTurnGoal);
  }

  return required.slice(0, 3);
}

function synchronizeRequiredResponseContract(
  context: CustomerServiceHumanContext,
  rawModelTurnGoals: CustomerServiceTurnGoal[],
): CustomerServiceHumanContext {
  // `dominantTurnGoal` orders execution; it does not erase other evidence-bound
  // current-turn obligations. Required goals are therefore closed over the typed
  // Deep Recognition result, not reconstructed from keyword/regex semantics.
  const requiredTurnGoals = resolveCustomerServiceRequiredTurnGoals(context, rawModelTurnGoals);

  const acts: CustomerServiceResponseAct[] = [];
  const add = (...items: CustomerServiceResponseAct[]) => {
    for (const item of items) if (!acts.includes(item)) acts.push(item);
  };
  const goalKeys = new Set(requiredTurnGoals.map((goal) => goal.key));
  const negativeEmotion = context.emotionalDisclosure.detected && context.emotionalDisclosure.polarity === 'NEGATIVE';
  if (negativeEmotion) add('SPECIFIC_CONTEXT_ACKNOWLEDGEMENT');
  if (goalKeys.has('PROVIDE_EMOTIONAL_COMFORT')) add('DIRECT_WARM_CONTACT', 'SPECIFIC_CONTEXT_ACKNOWLEDGEMENT');
  if (goalKeys.has('PROVIDE_REQUESTED_ADVICE')) add('PRACTICAL_NEXT_STEP');
  if (goalKeys.has('ANSWER_INFORMATION')) add('DIRECT_ANSWER');
  if (goalKeys.has('LISTEN_TO_VENTING') || goalKeys.has('INVITE_EMOTIONAL_SHARING')) add('LISTENING_SPACE');
  if (goalKeys.has('RESPECT_EMOTIONAL_SPACE')
    || context.dialogueObligation.requestedDeltas.includes('NO_QUESTIONS')
    || context.dialogueObligation.requestedDeltas.includes('LISTEN_ONLY')
    || context.dialogueObligation.forbiddenRepeatedMoves.includes('ASK_QUESTION')) add('RESPECT_BOUNDARY');
  if (!acts.includes('RESPECT_BOUNDARY')) add('LOW_PRESSURE_CONTINUATION');

  // 首轮负面表达没有明确说“只听”时，不能再退回服务式采访。
  if (negativeEmotion
    && context.conversationTaskState.currentTurnRelation === 'NEW_REQUEST'
    && !goalKeys.has('LISTEN_TO_VENTING')
    && !goalKeys.has('RESPECT_EMOTIONAL_SPACE')) {
    add('DIRECT_WARM_CONTACT', 'OPTIONAL_SMALL_RELIEF');
  }
  return {
    ...context,
    requiredTurnGoals,
    requiredResponseActs: acts.slice(0, 6),
    semanticMoveBudget: acts.includes('OPTIONAL_SMALL_RELIEF')
      ? {
          ...context.semanticMoveBudget,
          maxCoreMoves: Math.max(context.semanticMoveBudget.maxCoreMoves, 2) as 1 | 2 | 3,
          allowedMoves: uniqueStrings([
            '直接、朋友式的温暖接触并点到客户刚说的处境',
            '补一个可选的小动作和不带问题的倾听空间',
            ...context.semanticMoveBudget.allowedMoves,
          ]),
          reason: '首轮负面情绪需要同时完成直接温暖接触和一个低压力小动作，两者都属于必需回应。',
        }
      : context.semanticMoveBudget,
  };
}

function alignHumanContextWithDominantGoal(context: CustomerServiceHumanContext): CustomerServiceHumanContext {
  const feedbackMode = context.dialogueObligation.feedbackHandlingMode;
  if (
    !['NONE', 'TRUST_REPAIR'].includes(feedbackMode)
    && context.dominantTurnGoal.key === 'REPAIR_TRUST'
  ) {
    const continuationGoal = context.rankedTurnGoals.find((item) => item.key !== 'REPAIR_TRUST' && !item.deferred);
    if (continuationGoal) {
      return alignHumanContextWithDominantGoal({
        ...context,
        dominantTurnGoal: continuationGoal,
        rankedTurnGoals: [
          continuationGoal,
          ...context.rankedTurnGoals.filter((item) => item.key !== continuationGoal.key),
        ],
      });
    }
  }
  const goal = context.dominantTurnGoal;
  const emotionalRequestedAdvice = goal.key === 'PROVIDE_REQUESTED_ADVICE'
    && (context.primaryMotive === 'EMOTIONAL_SHARING' || context.emotionalDisclosure?.detected === true);
  if (goal.key === 'CLOSE_CONVERSATION') {
    return {
      ...context,
      commercialOpenness: 'CLOSED',
      commercialOpennessScore: 0,
      interactionStrategy: {
        phase: 'CLOSING',
        firstMove: 'CONFIRM_OR_CLOSE',
        commercialTiming: 'HOLD',
        reason: goal.reason,
      },
      commercialStrategy: {
        ...context.commercialStrategy,
        stage: 'NO_COMMERCIAL_MOVE',
        objective: '只结束当前已经完成的交流。',
        discoveryTarget: '无',
        productMentionPolicy: 'PROHIBITED',
        reason: '当前 Turn Goal 是结束交流，历史服务/商业上下文不能重新开启本轮任务。',
      },
      semanticMoveBudget: {
        maxCoreMoves: 1,
        allowedMoves: ['一次必要且自然的收束'],
        forbiddenCombinations: uniqueStrings([
          '收束 + 重播上一轮建议',
          '收束 + 新问题',
          '收束 + 服务邀请或商业动作',
          ...context.semanticMoveBudget.forbiddenCombinations,
        ]).slice(0, 10),
        reason: '结束轮只完成收束，不把已经完成的内容重新包装成新价值。',
      },
      replyStrategy: {
        mode: 'NATURAL_CLOSE',
        primaryMove: '自然结束当前交流，不重播已完成内容。',
        secondaryMoves: [],
        continuation: 'CLOSE_NATURALLY',
        valueGoal: '让交流自然停在这里。',
        mustInclude: [],
        avoid: ['重复旧建议', '开启新话题', '追问', '服务式邀请', '商业推进'],
        reason: goal.reason,
      },
    };
  }
  if (goal.key === 'PROCESS_PROVIDED_INFORMATION') return alignHumanContextWithConversationTask(context);
  if (context.dialogueObligation.feedbackHandlingMode === 'TRUST_REPAIR') {
    const obligation = context.dialogueObligation;
    return {
      ...context,
      relationshipState: 'STRAINED',
      conversationStance: 'REPAIR_SERVICE',
      interactionStrategy: {
        phase: 'REPAIR',
        firstMove: 'REPAIR_RELATIONSHIP',
        commercialTiming: 'HOLD',
        reason: obligation.currentResponseObligation,
      },
      commercialStrategy: {
        ...context.commercialStrategy,
        stage: 'NO_COMMERCIAL_MOVE',
        objective: '只修复当前理解偏差并完成客户尚未满足的显性请求。',
        discoveryTarget: '无',
        productMentionPolicy: 'PROHIBITED',
        reason: '客户正在纠正上一轮回复，商业探索和额外问题必须暂停。',
      },
      semanticMoveBudget: {
        maxCoreMoves: 2,
        allowedMoves: ['一句简短承认没有接住客户', '立即完成当前回复义务'],
        forbiddenCombinations: [
          '道歉 + 再次重复被拒绝的回复动作',
          '解释自己为什么这样回复 + 继续追问',
          ...obligation.forbiddenRepeatedMoves.map((move) => `重复已拒绝动作：${move}`),
        ],
        reason: '修复必须短而直接，承认之后立即用新策略回应，不把篇幅花在自我解释上。',
      },
      replyStrategy: {
        mode: 'RELATIONSHIP_REPAIR',
        primaryMove: obligation.currentResponseObligation,
        secondaryMoves: obligation.unresolvedNeed ? [`完成未满足需求：${obligation.unresolvedNeed}`] : [],
        continuation: 'WAIT_FOR_CUSTOMER',
        valueGoal: '让客户看到系统已经理解纠正并切换了回复策略。',
        mustInclude: ['简短承认上一轮未接住', obligation.unresolvedNeed || '准确完成最新请求'],
        avoid: [
          '解释客服自己的推理过程',
          '泛化共情模板',
          '服务菜单或选择题',
          ...obligation.forbiddenRepeatedMoves,
        ],
        reason: goal.reason,
      },
    };
  }
  if (goal.key === 'INVITE_POSITIVE_SHARING') {
    return {
      ...context,
      interactionStrategy: {
        phase: 'OPENING', firstMove: 'ACKNOWLEDGE_AND_INVITE_SHARING', commercialTiming: 'WAIT_FOR_CONTEXT',
        reason: '本轮第一目标是承接积极分享欲，潜在经营探索必须延后到客户分享具体内容之后。',
      },
      commercialStrategy: {
        ...context.commercialStrategy,
        objective: '本轮只承接客户的积极分享欲并邀请其继续说；商业探索延后到客户给出具体内容之后。',
        discoveryTarget: '客户愿意分享的开心内容，不主动询问近期安排、商品、预算或购买意向',
        productMentionPolicy: 'PROHIBITED',
        transitionSignals: uniqueStrings([
          '客户主动分享具体事件、生活场景、困扰或偏好',
          ...context.commercialStrategy.transitionSignals,
        ]).slice(0, 6),
        reason: '主导目标是承接积极分享欲，经营阶段只能后台保留，不能改变本轮第一动作。',
      },
      semanticMoveBudget: {
        maxCoreMoves: 1,
        allowedMoves: ['一次自然承接加一次低压力分享邀请（整体视为一个核心动作）'],
        forbiddenCombinations: uniqueStrings([
          '跳过分享欲直接探索近期安排',
          '善意猜测 + 生活场景问题',
          ...context.semanticMoveBudget.forbiddenCombinations,
        ]).slice(0, 10),
        reason: '本轮显性分享目标优先，只允许承接并邀请分享，不得同时执行生活场景或商业探索。',
      },
      replyStrategy: {
        mode: 'PLAYFUL_INVITATION',
        primaryMove: '先承接客户的积极分享欲，可做一次保留不确定性的善意猜测，再邀请客户继续分享。',
        secondaryMoves: ['当前不转向近期安排、商品、预算或购买问题', '表情只可低频补充朋友式互动'],
        continuation: 'INVITE_SHARING',
        valueGoal: '让客户感到这份开心被真正接住，并愿意说出具体内容。',
        mustInclude: ['积极分享欲承接', '自然分享邀请'],
        avoid: ['泛化评价开心', '直接探索近期安排', '把开心作为消费理由', '多重猜测'],
        reason: goal.reason,
      },
    };
  }
  if (goal.key === 'INVITE_EMOTIONAL_SHARING') {
    return {
      ...context,
      interactionStrategy: { phase: 'OPENING', firstMove: 'ACKNOWLEDGE_AND_INVITE_SHARING', commercialTiming: 'HOLD', reason: goal.reason },
      commercialStrategy: {
        ...context.commercialStrategy,
        objective: '只承接客户当前情绪并给出继续表达的空间。',
        discoveryTarget: '客户愿意继续表达的具体内容',
        productMentionPolicy: 'PROHIBITED',
        reason: '情绪分享目标优先，当前不执行商业探索。',
      },
      semanticMoveBudget: {
        maxCoreMoves: 1,
        allowedMoves: ['一次贴合情绪的自然承接加一次低压力分享邀请'],
        forbiddenCombinations: uniqueStrings(['心理分析 + 追问', '情绪承接 + 商品入口', ...context.semanticMoveBudget.forbiddenCombinations]).slice(0, 10),
        reason: '本轮只处理情绪分享目标，不叠加原因分析、生活场景或商品探索。',
      },
      replyStrategy: {
        mode: 'FRIENDLIKE_REACTION', primaryMove: '先贴合客户当前情绪并邀请其继续说。', secondaryMoves: ['不分析原因', '不进入商品'],
        continuation: 'INVITE_SHARING', valueGoal: '给客户自然表达空间。', mustInclude: ['情绪承接', '分享空间'],
        avoid: ['心理分析', '说教', '商品入口'], reason: goal.reason,
      },
    };
  }
  if (['PROVIDE_EMOTIONAL_COMFORT', 'LISTEN_TO_VENTING', 'RESPECT_EMOTIONAL_SPACE'].includes(goal.key)
    || emotionalRequestedAdvice) {
    const isComfort = goal.key === 'PROVIDE_EMOTIONAL_COMFORT';
    const isAdvice = emotionalRequestedAdvice;
    const isSpace = goal.key === 'RESPECT_EMOTIONAL_SPACE';
    return {
      ...context,
      commercialOpenness: 'CLOSED',
      commercialOpennessScore: 0,
      interactionStrategy: {
        phase: 'SHARING',
        firstMove: 'RESPOND_TO_SHARED_CONTEXT',
        commercialTiming: 'HOLD',
        reason: goal.reason,
      },
      commercialStrategy: {
        ...context.commercialStrategy,
        stage: 'NO_COMMERCIAL_MOVE',
        objective: '只完成客户当前明确提出的情绪交流请求。',
        discoveryTarget: '无',
        productMentionPolicy: 'PROHIBITED',
        reason: '客户正在明确请求安慰、倾听、建议或空间，本轮不执行商业探索。',
      },
      emotionStrategy: {
        ...context.emotionStrategy,
        posture: 'EMPATHETIC_ACCOUNTABLE',
        warmth: Math.max(context.emotionStrategy.warmth, 76),
        playfulness: 0,
        validationPriority: 100,
        solutionPriority: isAdvice ? 45 : 20,
        emojiPolicy: 'AVOID',
        guidance: isComfort
          ? ['先直接给予安慰', '贴合当前负面事件', '不说教、不强行让客户振作']
          : isAdvice
            ? ['先承接当前处境', '给出少量可执行建议', '保留客户决定权']
            : isSpace
              ? ['停止追问', '确认客户边界', '保留之后继续交流的空间']
              : ['接住客户想表达或吐槽的请求', '按客户节奏倾听', '不急着分析或给建议'],
        forbiddenTone: ['俏皮', '哈哈', '开心或顺心措辞', '心理分析', '人生道理', '商品或销售入口'],
        reason: '显性情绪交流请求必须直接完成，不能退回普通闲聊或积极分享策略。',
      },
      replyStrategy: {
        mode: 'FRIENDLIKE_REACTION',
        primaryMove: isComfort
          ? '直接针对当前事件给予安慰，不能只重复“我听着”。'
          : isAdvice
            ? '先承接当前处境，再给出一到两个低压力建议。'
            : isSpace
              ? '确认客户暂时不想展开的边界并停止追问。'
              : '明确接住客户想吐槽或希望被倾听的请求。',
        secondaryMoves: isComfort
          ? ['可补一句低压力倾诉空间']
          : isAdvice
            ? ['建议只作为可选方向，不替客户决定']
            : isSpace
              ? ['保留稍后继续交流的空间']
              : ['不分析、不纠正、不强行建议'],
        continuation: isSpace ? 'WAIT_FOR_CUSTOMER' : isAdvice ? 'OPEN_STATEMENT' : 'WAIT_FOR_CUSTOMER',
        valueGoal: goal.responseRequirement,
        mustInclude: [goal.name],
        avoid: ['积极分享模板', '商业探索', '心理分析', '说教'],
        reason: goal.reason,
      },
    };
  }
  if (['ANSWER_INFORMATION', 'SUMMARIZE_CONVERSATION', 'EXECUTE_REQUEST', 'RESOLVE_CURRENT_PROBLEM', 'CLARIFY_NEED'].includes(goal.key)
    || (goal.key === 'PROVIDE_REQUESTED_ADVICE' && !emotionalRequestedAdvice)) {
    return {
      ...context,
      interactionStrategy: {
        phase: 'SERVICE',
        firstMove: goal.key === 'CLARIFY_NEED' ? 'CLARIFY_NEED' : 'SOLVE_CURRENT_ISSUE',
        commercialTiming: 'HOLD',
        reason: goal.reason,
      },
      commercialStrategy: {
        ...context.commercialStrategy,
        stage: 'NO_COMMERCIAL_MOVE',
        objective: '只完成客户当前明确的实质任务，不追加需求探索或商业推进。',
        reason: `当前 Turn Goal ${goal.key} 已经拥有本轮任务；商业开放度只能作为背景，不能制造额外动作。`,
      },
    };
  }
  if (goal.key === 'RESPOND_TO_SHARED_CONTEXT' && context.interactionStrategy.phase === 'OPENING') {
    return {
      ...context,
      interactionStrategy: { ...context.interactionStrategy, phase: 'SHARING', firstMove: 'RESPOND_TO_SHARED_CONTEXT', reason: goal.reason },
    };
  }
  return context;
}

function turnGoalName(key: CustomerServiceTurnGoal['key']) {
  const names: Record<CustomerServiceTurnGoal['key'], string> = {
    INVITE_POSITIVE_SHARING: '承接积极分享欲', INVITE_EMOTIONAL_SHARING: '承接情绪并邀请分享',
    PROVIDE_EMOTIONAL_COMFORT: '直接给予情绪安慰', LISTEN_TO_VENTING: '倾听吐槽与表达',
    PROVIDE_REQUESTED_ADVICE: '回应明确建议请求', RESPECT_EMOTIONAL_SPACE: '尊重暂不展开的边界',
    RESPOND_TO_SHARED_CONTEXT: '回应已分享内容', PROCESS_PROVIDED_INFORMATION: '处理客户已补充的信息', HANDLE_INFORMATION_BARRIER: '处理资料障碍并降低客户负担', ANSWER_INFORMATION: '回答当前问题', SUMMARIZE_CONVERSATION: '总结已确认的前文内容', EXECUTE_REQUEST: '响应操作请求',
    RESOLVE_CURRENT_PROBLEM: '解决当前问题', REPAIR_TRUST: '修复信任', CLARIFY_NEED: '确认当前需要',
    EXPLORE_PRODUCT_NEED: '理解商品需求', SUPPORT_PURCHASE_DECISION: '支持购买判断', CONFIRM_TRANSACTION: '确认成交下一步',
    DISCOVER_LIFE_CONTEXT: '发现生活上下文', MAINTAIN_RELATIONSHIP: '维持自然关系', CLOSE_CONVERSATION: '自然结束交流',
  };
  return names[key];
}

function normalizeCommercialStrategy(
  value: Record<string, unknown>,
  fallback: CustomerServiceHumanContext['commercialStrategy'],
  openness: CustomerServiceCommercialOpenness,
): CustomerServiceHumanContext['commercialStrategy'] {
  if (openness === 'CLOSED') {
    return {
      ...fallback,
      stage: 'NO_COMMERCIAL_MOVE',
      productMentionPolicy: 'PROHIBITED',
      objective: '只处理当前问题或客户边界，不设置经营目标。',
      discoveryTarget: '无',
    };
  }
  const stage = normalizeEnum(value.stage, COMMERCIAL_STAGES, fallback.stage);
  const earlyStage = ['NO_COMMERCIAL_MOVE', 'RELATIONSHIP_BUILDING', 'CONTEXT_DISCOVERY', 'NEED_EXPLORATION'].includes(stage);
  const requestedPolicy = normalizeEnum(value.productMentionPolicy, PRODUCT_MENTION_POLICIES, fallback.productMentionPolicy);
  return {
    stage,
    objective: normalizeString(value.objective, fallback.objective, 1000),
    discoveryTarget: normalizeString(value.discoveryTarget, fallback.discoveryTarget, 600),
    productMentionPolicy: earlyStage ? 'PROHIBITED' : requestedPolicy,
    transitionSignals: stringArray(value.transitionSignals, 8, fallback.transitionSignals),
    evidence: stringArray(value.evidence, 8, fallback.evidence),
    reason: normalizeString(value.reason, fallback.reason, 1000),
  };
}

function normalizeSemanticMoveBudget(
  value: Record<string, unknown>,
  fallback: CustomerServiceSemanticMoveBudget,
  phase: CustomerServiceConversationPhase,
): CustomerServiceSemanticMoveBudget {
  const requested = Math.trunc(clampNumber(value.maxCoreMoves, fallback.maxCoreMoves, 1, 3));
  const phaseMaximum = phase === 'OPENING' ? 1 : phase === 'SHARING' ? 2 : 3;
  return {
    maxCoreMoves: Math.min(requested, phaseMaximum) as 1 | 2 | 3,
    allowedMoves: stringArray(value.allowedMoves, 6, fallback.allowedMoves),
    forbiddenCombinations: stringArray(value.forbiddenCombinations, 8, fallback.forbiddenCombinations),
    reason: normalizeString(value.reason, fallback.reason, 800),
  };
}

function isUnstableEmotionIntent(value: string) {
  return new Set([
    'POSITIVE_EMOTION_SHARING', 'HAPPY_SHARING', 'POSITIVE_SHARING',
    'SHARE_HAPPINESS', 'MOOD_SHARING',
  ]).has(value);
}

function stabilizePrimaryIntent(primaryScenario: string, proposedIntent: string, fallbackIntent: string) {
  if (primaryScenario !== 'CASUAL_CHAT') return proposedIntent;
  if (fallbackIntent === 'EMOTIONAL_DISCLOSURE' && ['CASUAL', 'RELATIONSHIP_CONTACT', 'EMOTIONAL_SHARING', 'EMOTION_EXPRESSION', ''].includes(proposedIntent)) {
    return 'EMOTIONAL_DISCLOSURE';
  }
  if (['NEGATIVE_SHARING', 'EMOTIONAL_DISCLOSURE', 'VENTING', 'SEEK_LISTENING', 'SEEK_COMFORT', 'RELATIONSHIP_DISTRESS', 'GRIEF_OR_LOSS'].includes(proposedIntent)) {
    return 'EMOTIONAL_DISCLOSURE';
  }
  if (isUnstableEmotionIntent(proposedIntent)) {
    return ['CASUAL', 'RELATIONSHIP_CONTACT'].includes(fallbackIntent) ? fallbackIntent : 'CASUAL';
  }
  return proposedIntent || (['CASUAL', 'RELATIONSHIP_CONTACT', 'EMOTIONAL_DISCLOSURE'].includes(fallbackIntent) ? fallbackIntent : 'CASUAL');
}

function normalizeRecognizedItems(
  value: unknown,
  fallback: CustomerServiceRecognizedItem[],
  catalog: CustomerServiceRecognitionCatalogItem[],
  context: { primaryScenario: string; primaryIntent: string; riskLevel: CustomerServiceTopic['riskLevel']; message: string },
) {
  const serviceScenario = isCustomerServiceScenario(context.primaryScenario);
  const modelItems = asArray(value)
    .map((item) => normalizeRecognizedItem(asRecord(item) as ModelRecognitionItem, context))
    .filter((item): item is CustomerServiceRecognizedItem & { matchedDefinitionKey?: string } => Boolean(item))
    .filter((item) => !(serviceScenario && item.type === 'INTENT' && (item.suggestedScenario === 'CASUAL_CHAT' || item.suggestedPrimaryIntent === 'PURCHASE_EXPLORATION')));
  if (!modelItems.length) return attachDefinitionMatches(fallback, catalog).slice(0, 12);

  const stableFallbackIntents = fallback.filter((item) => item.type === 'INTENT' && item.scope === 'CONVERSATION');
  const hasStableModelIntent = modelItems.some((item) => item.type === 'INTENT' && item.scope === 'CONVERSATION');
  const items = hasStableModelIntent
    ? modelItems
    : [...stableFallbackIntents, ...modelItems];
  return attachDefinitionMatches(uniqueBy(items, (item) => `${item.type}|${item.key}`), catalog).slice(0, 12);
}


function normalizeRecognizedItem(
  item: ModelRecognitionItem,
  context: { primaryScenario: string; primaryIntent: string; riskLevel: CustomerServiceTopic['riskLevel']; message: string },
): (CustomerServiceRecognizedItem & { matchedDefinitionKey?: string }) | null {
  const type = normalizeEnum(item.type, ['INTENT', 'EVENT', 'STATE', 'SIGNAL'] as const, null);
  const normalizedRawKey = normalizeKey(item.key);
  const suggestedScenario = normalizeCode(item.suggestedScenario) || context.primaryScenario;
  const normalizedSuggestedCategory = normalizeCategory(item.suggestedCategory, suggestedScenario);
  // Recognition owns semantic keys only. If a model echoes a downstream State scope
  // (constraint.<taskId>.<semanticKey>), strip that transport scope before the State
  // reducer applies the current task scope exactly once. This is category/key-shape
  // normalization, not a domain/value/example branch.
  const key = normalizedSuggestedCategory === 'CUSTOMER_CONSTRAINT'
    ? normalizeCustomerConstraintSemanticKey(normalizedRawKey)
    : normalizedRawKey;
  // `name` is descriptive metadata, not semantic admission authority. Older/compact
  // model outputs may legitimately follow the structured schema with only a key;
  // do not discard an otherwise valid recognized item merely because display text
  // is absent. The model-owned semantic key is the safest non-invented fallback.
  const name = normalizeString(item.name, key, 160);
  if (!type || !key) return null;
  if (normalizedSuggestedCategory === 'CUSTOMER_CONSTRAINT') {
    const constraintBasis = normalizeEnum(item.constraintBasis, CUSTOMER_CONSTRAINT_BASES, null);
    const constraintRole = normalizeEnum(item.constraintRole, CUSTOMER_CONSTRAINT_ROLES, null);
    const changesDecisionSpace = item.changesDecisionSpace === true;
    // R2.1 sealed regression boundary: admission is now three-part. The proposition
    // must be customer-established, must function as a condition on a still-open
    // decision (not the outcome of a decision or an action/purchase intention), and
    // must materially change decision space. This remains inside the same Deep
    // Recognition result; no lexical branch or second classifier is introduced.
    if (
      constraintBasis !== 'CUSTOMER_ESTABLISHED'
      || constraintRole !== 'OPEN_DECISION_CONDITION'
      || !changesDecisionSpace
    ) return null;
  }
  const rawSuggestedPrimaryIntent = normalizeCode(item.suggestedPrimaryIntent) || context.primaryIntent;
  const suggestedPrimaryIntent = canonicalIntentForScenario(suggestedScenario, rawSuggestedPrimaryIntent);
  const normalizedType = type === 'INTENT'
    && suggestedScenario === 'CASUAL_CHAT'
    && context.primaryIntent !== 'EMOTIONAL_DISCLOSURE'
    && (isUnstableEmotionIntent(rawSuggestedPrimaryIntent) || ['EMOTIONAL_SHARING', 'EMOTION_EXPRESSION'].includes(rawSuggestedPrimaryIntent))
    ? 'EVENT'
    : type;
  const finalSuggestedPrimaryIntent = normalizedType === 'INTENT'
    && suggestedScenario === 'CASUAL_CHAT'
    && context.primaryIntent === 'EMOTIONAL_DISCLOSURE'
    && ['CASUAL', 'RELATIONSHIP_CONTACT', 'EMOTIONAL_SHARING', 'EMOTION_EXPRESSION'].includes(suggestedPrimaryIntent)
      ? 'EMOTIONAL_DISCLOSURE'
      : suggestedPrimaryIntent;
  return {
    recognitionId: recognitionId(normalizedType, key, context.message),
    type: normalizedType,
    key,
    name,
    description: normalizeString(item.description, `${name}是本轮识别出的${typeLabel(normalizedType)}。`, 1200),
    confidence: clampNumber(item.confidence, 0.65, 0, 1),
    evidence: stringArray(item.evidence, 8, [context.message]),
    isPrimary: normalizedType === 'INTENT' && item.isPrimary === true,
    scope: normalizedType === 'EVENT' ? 'TURN' : normalizeEnum(item.scope, RECOGNITION_SCOPES, normalizedType === 'INTENT' ? 'CONVERSATION' : 'TURN'),
    continuity: normalizeEnum(item.continuity, RECOGNITION_CONTINUITIES, 'CONTINUING'),
    eligibleForIntentLibrary: normalizedType === 'INTENT'
      && normalizeEnum(item.scope, RECOGNITION_SCOPES, 'CONVERSATION') === 'CONVERSATION'
      && item.eligibleForIntentLibrary !== false,
    suggestedCategory: normalizedSuggestedCategory,
    suggestedScenario,
    suggestedPrimaryIntent: finalSuggestedPrimaryIntent,
    suggestedRiskLevel: normalizeEnum(item.suggestedRiskLevel, RISK_LEVELS, context.riskLevel),
    matchedDefinition: null,
    matchStatus: 'UNMATCHED',
    matchScore: 0,
    matchReason: '尚未与正式意图库完成关联。',
    candidate: null,
    matchedDefinitionKey: normalizeKey(item.matchedDefinitionKey),
  };
}


function attachDefinitionMatches(items: CustomerServiceRecognizedItem[], catalog: CustomerServiceRecognitionCatalogItem[]) {
  return items.map((item) => {
    if (item.type !== 'INTENT') {
      return {
        ...item,
        matchedDefinition: null,
        matchStatus: 'UNMATCHED' as const,
        matchScore: 0,
        matchReason: '事件、状态和弱信号不会直接关联为正式客户意图。',
        candidate: item.candidate || null,
      };
    }

    // Exact catalog ownership may come only from the model-supplied catalog key or
    // from an unambiguous structured (scenario, primaryIntent) identity. Free-form
    // names/evidence/hints may still rank RELATED diagnostics below, but they may
    // never promote a definition to runtime EXACT authority.
    const hintedKey = normalizeKey((item as CustomerServiceRecognizedItem & { matchedDefinitionKey?: string }).matchedDefinitionKey);
    if (hintedKey) {
      const hinted = catalog.find((entry) => entry.key === hintedKey) || null;
      const structurallyCompatible = hinted
        && hinted.scenario === item.suggestedScenario
        && hinted.primaryIntent === item.suggestedPrimaryIntent;
      if (structurallyCompatible) {
        return {
          ...item,
          matchedDefinition: {
            id: hinted.id, key: hinted.key, name: hinted.name, category: hinted.category,
            scenario: hinted.scenario, primaryIntent: hinted.primaryIntent,
          },
          matchStatus: 'EXACT' as const,
          matchScore: 100,
          matchReason: 'Deep Recognition 明确给出正式意图 key，且结构化场景/主意图一致。',
          candidate: null,
        };
      }
    }

    const uniqueScenarioIntentMatches = catalog.filter((entry) =>
      entry.scenario === item.suggestedScenario && entry.primaryIntent === item.suggestedPrimaryIntent,
    );
    if (!hintedKey && uniqueScenarioIntentMatches.length === 1 && item.scope === 'CONVERSATION') {
      const matched = uniqueScenarioIntentMatches[0];
      return {
        ...item,
        matchedDefinition: {
          id: matched.id, key: matched.key, name: matched.name, category: matched.category,
          scenario: matched.scenario, primaryIntent: matched.primaryIntent,
        },
        matchStatus: 'EXACT' as const,
        matchScore: 100,
        matchReason: '结构化场景与主意图唯一映射到该正式意图定义。',
        candidate: null,
      };
    }

    const candidates = catalog
      .map((entry) => scoreDefinitionMatch(item, entry, hintedKey))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || right.definition.priority - left.definition.priority);
    const best = candidates[0] || null;
    const related = best && best.score >= 45;
    const matched = related ? best!.definition : null;
    return {
      ...item,
      matchedDefinition: matched ? {
        id: matched.id,
        key: matched.key,
        name: matched.name,
        category: matched.category,
        scenario: matched.scenario,
        primaryIntent: matched.primaryIntent,
      } : null,
      matchStatus: related ? 'RELATED' as const : 'UNMATCHED' as const,
      matchScore: best?.score || 0,
      matchReason: related
        ? `${best!.reason}；仅作诊断相关性，不授予 Runtime EXACT Authority。`
        : '正式意图库中暂未发现足够接近的定义，可作为候选意图单独审核。',
      candidate: item.candidate || null,
    };
  });
}
function scoreDefinitionMatch(
  item: CustomerServiceRecognizedItem,
  definition: CustomerServiceRecognitionCatalogItem,
  hintedKey: string,
) {
  let score = 0;
  const reasons: string[] = [];
  if (hintedKey && hintedKey === definition.key) {
    score += 100;
    reasons.push('深度识别器明确关联了该正式意图编码');
  } else if (item.key === definition.key) {
    score += 96;
    reasons.push('识别编码与正式意图编码一致');
  }

  const itemName = normalizeComparableText(item.name);
  const definitionName = normalizeComparableText(definition.name);
  if (itemName && definitionName && itemName === definitionName) {
    score += 70;
    reasons.push('意图名称一致');
  } else if (itemName && definitionName && (itemName.includes(definitionName) || definitionName.includes(itemName))) {
    score += 35;
    reasons.push('意图名称高度相关');
  }

  const scenarioExact = definition.scenario === item.suggestedScenario;
  const intentExact = definition.primaryIntent === item.suggestedPrimaryIntent;
  if (scenarioExact) { score += 18; reasons.push('场景一致'); }
  if (intentExact) { score += 22; reasons.push('主意图一致'); }
  if (definition.category === item.suggestedCategory) score += 8;

  const hintMatches = countRecognitionHintMatches(item, definition);
  if (hintMatches > 0) {
    score += Math.min(32, hintMatches * 16);
    reasons.push(`识别证据命中 ${hintMatches} 条正式意图正向样本或信号`);
  }

  // 仅场景和通用意图相同只能说明“相关”；但证据同时命中多个正式样本时可以精确关联。
  if (!hintedKey && item.key !== definition.key && itemName !== definitionName && hintMatches < 2) score = Math.min(score, 75);
  return {
    definition,
    score: Math.min(100, score),
    reason: reasons.length ? reasons.join('；') : '没有足够的编码、名称或场景依据。',
  };
}

function normalizeComparableText(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s·•,，。.!！?？_\-]/g, '');
}

function compactRecognitionHints(recognitionConfig: unknown, examples: unknown) {
  const recognition = asRecord(recognitionConfig);
  const exampleRecord = asRecord(examples);
  return {
    positiveSignals: stringArray(recognition.positiveSignals, 6),
    negativeSignals: stringArray(recognition.negativeSignals, 4),
    contextSignals: stringArray(recognition.contextSignals, 4),
    positiveExamples: stringArray(exampleRecord.positive, 4),
    boundaryExamples: stringArray(exampleRecord.boundary, 3),
  };
}

function countRecognitionHintMatches(item: CustomerServiceRecognizedItem, definition: CustomerServiceRecognitionCatalogItem) {
  const hints = compactRecognitionHints(definition.recognitionConfig, definition.examples);
  const candidates = [...hints.positiveSignals, ...hints.contextSignals, ...hints.positiveExamples, ...hints.boundaryExamples]
    .map(normalizeComparableText).filter((value) => value.length >= 2);
  const evidenceParts = [item.name, item.description, ...item.evidence]
    .map(normalizeComparableText)
    .filter((value) => value.length >= 2);
  return [...new Set(candidates)].filter((hint) => evidenceParts.some((evidence) => evidence.includes(hint) || hint.includes(evidence))).length;
}


function hasRecognitionStructuralConflict(understanding: CustomerServiceMessageUnderstanding) {
  const human = understanding.humanContext;
  const task = human.conversationTaskState;
  const goal = human.dominantTurnGoal;
  const substantive = CURRENT_TURN_AUTHORITATIVE_GOALS.has(goal.key)
    && !['CLOSE_CONVERSATION'].includes(goal.key);

  if (goal.key === 'CLOSE_CONVERSATION' && human.interactionStrategy.phase !== 'CLOSING') return true;
  if (task.currentTurnRelation === 'INFORMATION_BARRIER'
    && task.pendingSlots.length
    && goal.key !== 'HANDLE_INFORMATION_BARRIER') return true;
  if (task.status === 'READY_TO_ADVANCE'
    && task.providedSlots.length
    && goal.key !== 'PROCESS_PROVIDED_INFORMATION') return true;
  if (substantive && human.interactionStrategy.phase === 'OPENING') return true;
  if (substantive && human.primaryMotive === 'RELATIONSHIP_CONTACT') return true;
  if (understanding.primaryScenario === 'CASUAL_CHAT'
    && human.primaryMotive === 'RELATIONSHIP_CONTACT'
    && isCustomerServiceScenario(task.activeScenario)
    && task.status !== 'NONE') return true;
  return false;
}

function resolveRecognitionFastPath(
  _dto: CompileCustomerServiceSimulationDto,
  _heuristic: CustomerServiceMessageUnderstanding,
) {
  // Semantic fast paths are retired. Open-language interpretation is owned by Deep
  // Recognition; model-unavailable behavior uses the neutral compatibility projection.
  return null;
}

function validateRecognitionPayload(value: ModelRecognitionPayload) {
  const record = asRecord(value);
  const primaryScenario = normalizeCode(record.primaryScenario);
  const primaryIntent = normalizeCode(record.primaryIntent);
  const intentRanking = asArray(record.intentRanking);
  const recognizedItems = asArray(record.recognizedItems);
  const humanContext = asRecord(record.humanContext);
  const dominantGoal = asRecord(humanContext.dominantTurnGoal);
  if (!primaryScenario && !primaryIntent && !intentRanking.length && !recognizedItems.length && !normalizeCode(dominantGoal.key)) {
    return 'JSON 对象缺少可用的场景、意图、识别项或本轮主导目标。';
  }
  if (record.intentRanking !== undefined && !Array.isArray(record.intentRanking)) return 'intentRanking 必须是数组。';
  if (record.recognizedItems !== undefined && !Array.isArray(record.recognizedItems)) return 'recognizedItems 必须是数组。';
  if (!Array.isArray(record.namedOfferingMentionSpans)) return 'namedOfferingMentionSpans 必须是数组。';
  if (record.namedOfferingMentionSpans.some((item) => typeof item !== 'string')) return 'namedOfferingMentionSpans 只能包含字符串。';
  if (!Array.isArray(humanContext.rankedTurnGoals) || humanContext.rankedTurnGoals.length === 0) {
    return 'humanContext.rankedTurnGoals 必须是非空数组。';
  }
  const dominantGoalKey = normalizeEnum(dominantGoal.key, TURN_GOAL_KEYS, null);
  if (!dominantGoalKey) return 'humanContext.dominantTurnGoal 必须包含合法 key。';

  // Root-Cause First representation gate: downstream is forbidden from reconstructing
  // open-language business semantics from raw wording, so the Deep Recognition envelope
  // must actually carry the orthogonal requested-contribution function it promises.
  // Treat omission/unknown values as a schema failure and use the existing compact JSON
  // regeneration path rather than silently falling back to an ambiguous goal label.
  const rawGoals = [humanContext.dominantTurnGoal, ...asArray(humanContext.rankedTurnGoals)]
    .filter((item) => Object.keys(asRecord(item)).length > 0);
  for (let index = 0; index < rawGoals.length; index += 1) {
    const goal = asRecord(rawGoals[index]);
    if (!normalizeEnum(goal.key, TURN_GOAL_KEYS, null)) {
      return `humanContext Turn Goal ${index + 1} 缺少合法 key。`;
    }
    if (!normalizeEnum(goal.requestedContributionKind, REQUESTED_CONTRIBUTION_KINDS, null)) {
      return `humanContext Turn Goal ${index + 1} 缺少合法 requestedContributionKind。`;
    }
    if (!normalizeEnum(goal.requestedEvidenceScope, REQUESTED_EVIDENCE_SCOPES, null)) {
      return `humanContext Turn Goal ${index + 1} 缺少合法 requestedEvidenceScope。`;
    }
    const decisionMode = normalizeEnum(goal.requestedDecisionMode, REQUESTED_DECISION_MODES, null);
    if (!decisionMode) {
      return `humanContext Turn Goal ${index + 1} 缺少合法 requestedDecisionMode。`;
    }
    const contributionKind = normalizeEnum(goal.requestedContributionKind, REQUESTED_CONTRIBUTION_KINDS, null);
    if (contributionKind === 'DECISION_SUPPORT' && decisionMode === 'NOT_APPLICABLE') {
      return `humanContext Turn Goal ${index + 1} 的 DECISION_SUPPORT 必须区分 ASSESS_CURRENT_OPTION 或 SELECT_OR_PRIORITIZE_OPTION。`;
    }
    if (contributionKind !== 'DECISION_SUPPORT' && decisionMode !== 'NOT_APPLICABLE') {
      return `humanContext Turn Goal ${index + 1} 只有 DECISION_SUPPORT 可以使用非 NOT_APPLICABLE 的 requestedDecisionMode。`;
    }
    if (!normalizeEnum(goal.requestedAnswerFocus, REQUESTED_ANSWER_FOCUSES, null)) {
      return `humanContext Turn Goal ${index + 1} 缺少合法 requestedAnswerFocus。`;
    }
  }
  const dominantContribution = normalizeEnum(dominantGoal.requestedContributionKind, REQUESTED_CONTRIBUTION_KINDS, null);
  const dominantEvidenceScope = normalizeEnum(dominantGoal.requestedEvidenceScope, REQUESTED_EVIDENCE_SCOPES, null);
  const dominantDecisionMode = normalizeEnum(dominantGoal.requestedDecisionMode, REQUESTED_DECISION_MODES, null);
  const dominantAnswerFocus = normalizeEnum(dominantGoal.requestedAnswerFocus, REQUESTED_ANSWER_FOCUSES, null);
  const dominantPresent = asArray(humanContext.rankedTurnGoals).some((item) => {
    const goal = asRecord(item);
    return normalizeEnum(goal.key, TURN_GOAL_KEYS, null) === dominantGoalKey
      && normalizeEnum(goal.requestedContributionKind, REQUESTED_CONTRIBUTION_KINDS, null) === dominantContribution
      && normalizeEnum(goal.requestedEvidenceScope, REQUESTED_EVIDENCE_SCOPES, null) === dominantEvidenceScope
      && normalizeEnum(goal.requestedDecisionMode, REQUESTED_DECISION_MODES, null) === dominantDecisionMode
      && normalizeEnum(goal.requestedAnswerFocus, REQUESTED_ANSWER_FOCUSES, null) === dominantAnswerFocus;
  });
  if (!dominantPresent) {
    return 'humanContext.rankedTurnGoals 必须包含与 dominantTurnGoal 相同的 typed semantic goal。';
  }
  return null;
}

function buildJsonRepairPrompt(originalRequest: string, content: string, parseError: string | null) {
  return {
    system: [
      '你是 JSON 结构再生成器。不要解释错误，也不要逐字复制残缺内容。',
      '根据原识别任务和残缺响应，重新生成一份更短、语义一致的合法 JSON 对象。',
      '只允许顶层字段：primaryScenario、primaryIntent、riskLevel、emotion、confidence、intentRanking、recognizedItems、humanContext、contextualReferentSignal、namedOfferingMentionSpans。contextualReferentSignal 若存在必须保留原有 UNIQUE candidateId/sourceQuote 或 SET candidateIds/sourceQuotes，以及逐字 evidence；不得把 SET 降成 UNIQUE/AMBIGUOUS，也不得新增 deliveredReferentCandidates 之外的候选 ID。namedOfferingMentionSpans 必须始终输出数组，只含 latestMessage 中客户实际命名具体商品/服务的连续逐字 span，无则 []，不得截短更长客户命名，也不得吞入后续场景/用途/属性/评价/问句。',
      'humanContext 只保留：primaryMotive、commercialOpenness、rankedTurnGoals、dominantTurnGoal、dialogueFeedbackSignal、stateTruthSignal。rankedTurnGoals 和 dominantTurnGoal 的每个 goal 必须保留 requestedContributionKind（INFORMATION|DECISION_SUPPORT|ACTION|ADVICE|OTHER）、requestedEvidenceScope（MERCHANT_BUSINESS|GENERAL_DOMAIN|NOT_APPLICABLE）、requestedDecisionMode（ASSESS_CURRENT_OPTION|SELECT_OR_PRIORITIZE_OPTION|NOT_APPLICABLE）与 requestedAnswerFocus（OVERVIEW|APPLICATION_USAGE|HOW_TO|WHY_REASON|COMPARISON|LIMITATION_BOUNDARY|COMPATIBILITY|PRICE_COST|AVAILABILITY|STATUS_PROGRESS|RECOMMENDATION|TROUBLESHOOTING|PRODUCT_CAPABILITIES|CURRENT_SPECIFIC_QUESTION|AI_IDENTITY|PUBLIC_NAME|SERVICE_ROLE|SERVICE_SCOPE|NOT_APPLICABLE）；DECISION_SUPPORT 必须使用前两种 decision mode，其他 contribution 必须使用 NOT_APPLICABLE。不得只保留 key 后让下游从原文重建功能、决策模式、回答 facet 或 Grounding ownership。dialogueFeedbackSignal 若原任务存在则必须保留，evidence 与 receptionEvidence 内的非空证据仍须逐字来自 latestMessage；stateTruthSignal 若原任务存在也必须保留，mutation evidence 逐字来自 latestMessage，target ID 不得自造。',
      'intentRanking最多3项，recognizedItems最多3项且只保留关键INTENT/EVENT与显式CUSTOMER_CONSTRAINT STATE；存在显式决策约束时优先保留该 STATE，不让重复同义的普通 EVENT/STATE 挤占容量；rankedTurnGoals最多3项；每个 evidence 最多1条。',
      '不要输出 topics、商业策略、对话任务状态、完整回复策略或其他本地可补齐字段。',
      '输出必须是一个完整合法 JSON 对象，不要输出 Markdown、代码块、注释、前缀或后缀。',
    ].join('\n'),
    user: JSON.stringify({
      task: '重新生成紧凑且合法的客户识别 JSON。',
      parseError,
      originalRequest: originalRequest.slice(0, 22000),
      malformedResponse: content.slice(0, 12000),
    }),
  };
}

type DetailedJsonParseResult = {
  value: ModelRecognitionPayload | null;
  error: string | null;
  repaired: boolean;
};

function parseJsonObjectDetailed(content: string): DetailedJsonParseResult {
  const cleaned = String(content || '').replace(/^\uFEFF/, '').trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() || null;
  const balanced = extractBalancedJsonObject(fenced || cleaned);
  const likely = extractLikelyJsonObject(fenced || cleaned);
  const candidates = [cleaned, fenced, balanced, likely].filter((value): value is string => Boolean(value));
  let lastError: string | null = null;

  for (const candidate of [...new Set(candidates)]) {
    const normalized = repairCommonJson(candidate);
    const variants = [candidate, normalized, repairStructuralJson(normalized)];
    for (const [variantIndex, variant] of [...new Set(variants)].entries()) {
      let current = variant;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          const value = JSON.parse(current);
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            return { value: value as ModelRecognitionPayload, error: variantIndex > 0 || attempt > 0 ? lastError : null, repaired: variantIndex > 0 || attempt > 0 };
          }
          lastError = '根节点不是 JSON 对象';
          break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          const next = repairJsonAtParseError(current, lastError);
          if (!next || next === current) break;
          current = next;
        }
      }
    }
  }
  return { value: null, error: lastError || '未找到完整 JSON 对象', repaired: false };
}

function repairCommonJson(value: string) {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^\s*(?:json\s*)?/i, '')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*:)/g, '$1"$2"$3')
    .trim();
}

function repairStructuralJson(value: string) {
  let repaired = value
    .replace(/\bNone\b/g, 'null')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/([}\]])\s*(?="[^"]+"\s*:)/g, '$1,')
    .replace(/}\s*{/g, '},{')
    .replace(/]\s*\[/g, '],[');
  repaired = closeTruncatedJson(repaired);
  return repaired;
}

function repairJsonAtParseError(value: string, message: string) {
  const position = Number(message.match(/position\s+(\d+)/i)?.[1] ?? -1);
  if (/Unexpected end of JSON input|unterminated string/i.test(message)) return closeTruncatedJson(value);
  if (position < 0 || position > value.length) return repairStructuralJson(value);

  const before = value.slice(0, position);
  const after = value.slice(position);
  if (/Expected ',' or '[}\]]' after (?:array element|property value)/i.test(message)) {
    const nextChar = after.trimStart()[0] || '';
    if (nextChar !== ',' && nextChar !== ']' && nextChar !== '}') return `${before},${after}`;
  }
  if (/Expected property name or '}'/i.test(message)) {
    return value.replace(/,\s*([}\]])/g, '$1');
  }
  if (/Unexpected token/i.test(message)) {
    const current = value[position];
    if (current === ';') return `${value.slice(0, position)},${value.slice(position + 1)}`;
  }
  return closeTruncatedJson(value);
}

function closeTruncatedJson(value: string) {
  const start = value.indexOf('{');
  if (start < 0) return value;
  let candidate = value.slice(start).trim().replace(/,\s*$/, '');
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' && stack[stack.length - 1] === '{') stack.pop();
    else if (char === ']' && stack[stack.length - 1] === '[') stack.pop();
  }
  if (inString) candidate += '"';
  while (stack.length) candidate += stack.pop() === '{' ? '}' : ']';
  return candidate.replace(/,\s*([}\]])/g, '$1');
}

function extractLikelyJsonObject(value: string) {
  const start = value.indexOf('{');
  if (start < 0) return null;
  const last = value.lastIndexOf('}');
  return last > start ? value.slice(start, last + 1) : value.slice(start);
}

function extractBalancedJsonObject(value: string) {
  const start = value.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return null;
}

function previewModelOutput(value: string | null | undefined) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return normalized.length <= 4000 ? normalized : `${normalized.slice(0, 4000)}\n…（已截断，共 ${normalized.length} 字符）`;
}

function maxRisk(...values: CustomerServiceTopic['riskLevel'][]) {
  const ranks: Record<CustomerServiceTopic['riskLevel'], number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  return values.reduce((max, value) => ranks[value] > ranks[max] ? value : max, 'LOW');
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T;
function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: null): T | null;
function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T | null): T | null {
  const normalized = String(value ?? '').trim().toUpperCase() as T;
  return allowed.includes(normalized) ? normalized : fallback;
}

function uniqueEnumArray<T extends string>(value: unknown, allowed: readonly T[], fallback: T[]) {
  const result = asArray(value).map((item) => normalizeEnum(item, allowed, null)).filter((item): item is T => Boolean(item));
  return result.length ? [...new Set(result)] : fallback;
}

function normalizeCode(value: unknown) {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_').replace(/[^A-Z0-9_*]/g, '');
  return normalized || null;
}

function normalizeModelScenario(value: unknown) {
  const normalized = normalizeCode(value);
  if (!normalized) return null;
  const aliases: Record<string, string> = {
    PRODUCT_COMPARISON: 'PRODUCT_COMPARE',
    LOGISTICS: 'LOGISTICS_DELAY',
    PRE_SALE: 'PRODUCT_CONSULT',
    SAFETY: 'SAFETY_SENSITIVE',
    SAFETY_INCIDENT: 'SAFETY_SENSITIVE',
    SAFETY_EMERGENCY: 'SAFETY_SENSITIVE',
  };
  return aliases[normalized] || normalized;
}

function normalizeModelPrimaryIntent(value: unknown) {
  const normalized = normalizeCode(value);
  if (!normalized) return null;
  const aliases: Record<string, string> = {
    EXECUTE_REQUEST: 'REQUEST_ACTION',
    PURCHASE_DECISION: 'PURCHASE_INTEREST',
    SUPPORT_PURCHASE_DECISION: 'PURCHASE_INTEREST',
  };
  return aliases[normalized] || normalized;
}


function emptyCustomerServiceStateTruthSignal(): CustomerServiceStateTruthSignal {
  return {
    authority: 'STATE_MUTATION_EVIDENCE_ONLY',
    task: { relation: 'NONE', targetTaskId: null, evidence: '', confidence: 0 },
    memory: { action: 'NONE', targetMemoryId: null, replacementValue: null, evidence: '', confidence: 0 },
    entity: { action: 'NONE', targetEntityId: null, replacementValue: null, evidence: '', confidence: 0 },
  };
}

export function resolveCustomerServiceStateTruthSignal(
  value: unknown,
  latestMessage: string,
  conversationState: unknown,
): CustomerServiceStateTruthSignal {
  const empty = emptyCustomerServiceStateTruthSignal();
  const record = asRecord(value);
  const state = readCustomerServiceConversationStateV2(conversationState);
  const summary = summarizeCustomerServiceConversationState(state, latestMessage);
  const activeTask = state.tasks.find((item) => item.id === state.activeTaskId) ?? null;
  const candidateTasks = state.tasks.filter((item) => item.status !== 'ABANDONED').slice(-12);
  const activeTaskIds = new Set(candidateTasks.map((item) => item.id));
  const resumableTaskIds = new Set(candidateTasks.filter((item) => ['SUSPENDED', 'RESOLVED'].includes(item.status)).map((item) => item.id));
  const relevantMemoryIds = new Set(summary.relevantMemories.map((item) => item.id));
  const candidateMemories = state.memories
    .filter((item) => !item.invalidated && !item.withdrawn)
    .filter((item) => relevantMemoryIds.has(item.id) || item.sourceTurn >= Math.max(0, state.currentTurn - 3))
    .slice(-16);
  const activeMemoryIds = new Set(candidateMemories.map((item) => item.id));
  const activeEntityIds = new Set(state.entities.filter((item) => !item.invalidated).slice(-20).map((item) => item.id));

  const taskRecord = asRecord(record.task);
  const taskRelations = ['NONE', 'CONTINUE_CURRENT', 'START_NEW', 'RESUME_EXISTING', 'RESOLVE_CURRENT', 'ABANDON_CURRENT'] as const;
  let relation = normalizeEnum(taskRecord.relation, taskRelations, 'NONE');
  let targetTaskId = stringOrNullValue(taskRecord.targetTaskId);
  const taskEvidence = normalizeString(taskRecord.evidence, '', 180);
  const taskConfidence = clampNumber(taskRecord.confidence, 0, 0, 1);
  const taskEvidenceValid = taskConfidence >= 0.84 && hasVerbatimCurrentTurnEvidence([taskEvidence], latestMessage);
  if (!taskEvidenceValid) relation = 'NONE';
  if (relation === 'START_NEW') targetTaskId = null;
  if (relation === 'CONTINUE_CURRENT' && (!activeTask || targetTaskId !== activeTask.id)) relation = 'NONE';
  if (relation === 'RESUME_EXISTING' && (!targetTaskId || !resumableTaskIds.has(targetTaskId))) relation = 'NONE';
  if (['RESOLVE_CURRENT', 'ABANDON_CURRENT'].includes(relation)
    && (!activeTask || targetTaskId !== activeTask.id)) relation = 'NONE';
  if (targetTaskId && !activeTaskIds.has(targetTaskId) && relation !== 'RESUME_EXISTING') relation = 'NONE';

  const readMutation = (kind: 'memory' | 'entity') => {
    const mutation = asRecord(record[kind]);
    const actions = ['NONE', 'SUPERSEDE', 'WITHDRAW'] as const;
    let action = normalizeEnum(mutation.action, actions, 'NONE');
    const idKey = kind === 'memory' ? 'targetMemoryId' : 'targetEntityId';
    let targetId = stringOrNullValue(mutation[idKey]);
    const evidence = normalizeString(mutation.evidence, '', 180);
    const confidence = clampNumber(mutation.confidence, 0, 0, 1);
    const evidenceValid = confidence >= 0.86 && hasVerbatimCurrentTurnEvidence([evidence], latestMessage);
    const validIds = kind === 'memory' ? activeMemoryIds : activeEntityIds;
    if (!evidenceValid || action === 'NONE' || !targetId || !validIds.has(targetId)) {
      action = 'NONE';
      targetId = null;
    }
    const rawReplacement = normalizeString(mutation.replacementValue, '', 180);
    const replacementValue = action === 'SUPERSEDE'
      && rawReplacement
      && hasVerbatimCurrentTurnEvidence([rawReplacement], latestMessage)
      ? rawReplacement
      : null;
    // R1: SUPERSEDE is an atomic truth transition. If the proposed new value is
    // not itself evidence-bound to the latest user turn, do not invalidate the
    // old state and leave a half-applied correction behind. WITHDRAW is the
    // explicit operation for removing a value without replacement.
    if (action === 'SUPERSEDE' && !replacementValue) {
      action = 'NONE';
      targetId = null;
    }
    return { action, targetId, replacementValue: action === 'NONE' ? null : replacementValue, evidence: action === 'NONE' ? '' : evidence, confidence: action === 'NONE' ? 0 : confidence };
  };

  const memory = readMutation('memory');
  const entity = readMutation('entity');
  return {
    authority: 'STATE_MUTATION_EVIDENCE_ONLY',
    task: {
      relation,
      targetTaskId: relation === 'NONE' ? null : targetTaskId,
      evidence: relation === 'NONE' ? '' : taskEvidence,
      confidence: relation === 'NONE' ? 0 : taskConfidence,
    },
    memory: { action: memory.action, targetMemoryId: memory.targetId, replacementValue: memory.replacementValue, evidence: memory.evidence, confidence: memory.confidence },
    entity: { action: entity.action, targetEntityId: entity.targetId, replacementValue: entity.replacementValue, evidence: entity.evidence, confidence: entity.confidence },
  };
}

function stringOrNullValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function customerServiceTurnGoalSemanticIdentity(goal: CustomerServiceTurnGoal) {
  return [
    goal.key,
    goal.requestedContributionKind || 'UNSPECIFIED',
    goal.requestedEvidenceScope || 'UNSPECIFIED',
    goal.requestedDecisionMode || 'UNSPECIFIED',
    goal.requestedAnswerFocus || 'UNSPECIFIED',
  ].join('|');
}

export function resolveCustomerServiceFactOwnershipFromTypedTurnGoals(
  goals: CustomerServiceTurnGoal[],
): CustomerServiceMessageUnderstanding['factOwnership'] | null {
  const active = goals.filter((goal) => !goal.deferred && Boolean(goal.requestedEvidenceScope));
  if (!active.length) return null;

  const merchantGoals = active.filter((goal) => goal.requestedEvidenceScope === 'MERCHANT_BUSINESS');
  const generalGoals = active.filter((goal) => goal.requestedEvidenceScope === 'GENERAL_DOMAIN');
  const selected = merchantGoals.length ? merchantGoals : generalGoals;
  const scope: CustomerServiceMessageUnderstanding['factOwnership']['scope'] = merchantGoals.length
    ? 'CURRENT_BUSINESS_FACT'
    : generalGoals.length
      ? 'GENERAL_DOMAIN'
      : 'NONE';
  const confidence = selected.length
    ? Math.max(...selected.map((goal) => goal.confidence))
    : Math.max(...active.map((goal) => goal.confidence));
  const scopeLabel = merchantGoals.length ? 'MERCHANT_BUSINESS' : generalGoals.length ? 'GENERAL_DOMAIN' : 'NOT_APPLICABLE';
  return {
    authority: 'MESSAGE_UNDERSTANDING_FACT_OWNERSHIP',
    scope,
    confidence,
    evidence: [
      `TYPED_EVIDENCE_SCOPE:${scopeLabel}`,
      ...selected.map((goal) => `TYPED_TURN_GOAL:${goal.key}`),
    ],
    reason: merchantGoals.length
      ? 'Deep Recognition 的当前轮 typed goal 明确要求依赖商家/业务事实；lexical fallback 不得把它降成通用领域知识。'
      : generalGoals.length
        ? 'Deep Recognition 的当前轮 typed goal 明确为一般领域证据范围；商家业务状态不得由该范围自动推断。'
        : 'Deep Recognition 的当前轮 typed goal 不要求事实/选择证据；不从原始措辞重建 Grounding ownership。',
    namedOfferingReferent: {
      authority: 'MESSAGE_UNDERSTANDING_NAMED_OFFERING_REFERENT',
      status: 'NONE',
      source: 'NONE',
      surface: null,
      resolvedGroundingIds: [],
    },
  };
}

function readRawModelCurrentTurnGoalValue(
  value: unknown,
  latestMessage: string,
): CustomerServiceTurnGoal | null {
  const goal = readRawModelTurnGoalValue(value, latestMessage);
  // Current-turn semantic authority is owned by the typed contribution function,
  // not only by the legacy goal-key whitelist. A valid model goal such as a coarse
  // discovery key carrying DECISION_SUPPORT/ACTION/INFORMATION remains executable
  // and must be visible to downstream intent/scenario arbitration.
  return goal && isCustomerServiceExecutableTypedGoal(goal) ? goal : null;
}

function readRawModelTurnGoalValue(
  value: unknown,
  latestMessage: string,
): CustomerServiceTurnGoal | null {
  const record = asRecord(value);
  const key = normalizeEnum(record.key, TURN_GOAL_KEYS, null);
  if (!key) return null;
  const requestedContributionKind = normalizeEnum(record.requestedContributionKind, REQUESTED_CONTRIBUTION_KINDS, null);
  const requestedEvidenceScope = normalizeEnum(record.requestedEvidenceScope, REQUESTED_EVIDENCE_SCOPES, null);
  const requestedDecisionMode = normalizeEnum(record.requestedDecisionMode, REQUESTED_DECISION_MODES, null);
  const requestedAnswerFocus = normalizeEnum(record.requestedAnswerFocus, REQUESTED_ANSWER_FOCUSES, null);
  const confidence = clampNumber(record.confidence, 0, 0, 1);
  const evidence = normalizeCustomerServiceRecognitionEvidence(record.evidence, 4);
  if (confidence < 0.82 || !hasVerbatimCurrentTurnEvidence(evidence, latestMessage)) return null;
  return {
    key,
    requestedContributionKind: requestedContributionKind || undefined,
    requestedEvidenceScope: requestedEvidenceScope || undefined,
    requestedDecisionMode: requestedDecisionMode || undefined,
    requestedAnswerFocus: requestedAnswerFocus || undefined,
    name: key,
    priority: clampNumber(record.priority, 1000, 0, 5000),
    confidence,
    evidence,
    reason: 'MODEL_CURRENT_TURN_TYPED_EVIDENCE',
    responseRequirement: 'CURRENT_TURN_SEMANTIC_AUTHORITY',
    source: 'MODEL',
    deferred: record.deferred === true,
  };
}

export function resolveCustomerServiceRawModelTurnGoals(
  payload: ModelRecognitionPayload,
  latestMessage: string,
): CustomerServiceTurnGoal[] {
  const humanContext = asRecord(payload.humanContext);
  return uniqueBy(
    [humanContext.dominantTurnGoal, ...asArray(humanContext.rankedTurnGoals)]
      .map((item) => readRawModelTurnGoalValue(item, latestMessage))
      .filter((item): item is CustomerServiceTurnGoal => Boolean(item && !item.deferred)),
    customerServiceTurnGoalSemanticIdentity,
  );
}

export function resolveCustomerServiceFeedbackOwnershipEvidence(
  payload: ModelRecognitionPayload,
  latestMessage: string,
) {
  return uniqueStrings(asArray(payload.recognizedItems).flatMap((raw) => {
    const item = asRecord(raw);
    if (normalizeCode(item.constraintRole) !== 'FEEDBACK_ONLY') return [];
    if (item.changesDecisionSpace === true || clampNumber(item.confidence, 0, 0, 1) < 0.72) return [];
    return normalizeCustomerServiceRecognitionEvidence(item.evidence, 8)
      .filter((evidence) => hasVerbatimCurrentTurnEvidence([evidence], latestMessage));
  }));
}

/**
 * P0-3 Final current-obligation ownership convergence.
 *
 * Deep Recognition already owns current-turn semantics through dominantTurnGoal
 * and rankedTurnGoals. Resolve contradictions inside that one existing Authority:
 * a model-produced, evidence-bound substantive obligation cannot coexist with a
 * dominant CLOSE_CONVERSATION and then be erased by accepted feedback. This is a
 * generic structured-goal precedence rule, not an utterance/role/domain detector.
 */
export function resolveCustomerServiceModelCurrentTurnGoal(
  payload: ModelRecognitionPayload,
  latestMessage: string,
): CustomerServiceTurnGoal | null {
  const humanContext = asRecord(payload.humanContext);
  const dominant = readRawModelCurrentTurnGoalValue(humanContext.dominantTurnGoal, latestMessage);
  const ranked = asArray(humanContext.rankedTurnGoals)
    .map((item) => readRawModelCurrentTurnGoalValue(item, latestMessage))
    .filter((item): item is CustomerServiceTurnGoal => Boolean(item));
  const candidates = uniqueBy(
    [dominant, ...ranked].filter((item): item is CustomerServiceTurnGoal => Boolean(item)),
    customerServiceTurnGoalSemanticIdentity,
  );
  if (!candidates.length) return null;

  // Preserve the existing protected close-vs-substantive contradiction repair.
  // Outside that proven contradiction, dominantTurnGoal remains the model envelope's
  // ordering pointer; compound obligations are preserved separately through
  // rawModelTurnGoals -> requiredTurnGoals rather than by inventing another arbiter.
  if (dominant?.key === 'CLOSE_CONVERSATION') {
    const substantive = candidates
      .filter((item) => item.key !== 'CLOSE_CONVERSATION' && !item.deferred)
      .sort((a, b) => b.priority - a.priority || b.confidence - a.confidence);
    if (substantive.length) return substantive[0];
  }
  return dominant || candidates
    .filter((item) => !item.deferred)
    .sort((a, b) => b.priority - a.priority || b.confidence - a.confidence)[0]
    || candidates[0];
}

export function normalizeCustomerServiceRecognitionEvidence(value: unknown, limit = 4) {
  const items = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? [value]
      : [];
  return [...new Set(items.map((item) => String(item ?? '').trim()).filter(Boolean))].slice(0, limit);
}

function resolveModelIntentFromSemanticGoal(
  payload: ModelRecognitionPayload,
  scenario: string | null,
  modelIntent: string | null,
  resolvedCurrentGoal: CustomerServiceTurnGoal | null,
) {
  const humanContext = asRecord(payload.humanContext);
  const dominantGoal = resolvedCurrentGoal?.key
    || normalizeCode(asRecord(humanContext.dominantTurnGoal).key);
  const requestedContributionKind = resolvedCurrentGoal?.requestedContributionKind
    || normalizeCode(asRecord(humanContext.dominantTurnGoal).requestedContributionKind);
  const requestedEvidenceScope = resolvedCurrentGoal?.requestedEvidenceScope
    || normalizeCode(asRecord(humanContext.dominantTurnGoal).requestedEvidenceScope);
  const requestedDecisionMode = resolvedCurrentGoal?.requestedDecisionMode
    || normalizeCode(asRecord(humanContext.dominantTurnGoal).requestedDecisionMode);

  if (requestedContributionKind === 'DECISION_SUPPORT' && requestedEvidenceScope === 'MERCHANT_BUSINESS') {
    if (requestedDecisionMode === 'ASSESS_CURRENT_OPTION') return 'ASK_INFORMATION';
    if (requestedDecisionMode === 'SELECT_OR_PRIORITIZE_OPTION') return 'PURCHASE_INTEREST';
  }
  if (requestedContributionKind === 'ACTION') return 'REQUEST_ACTION';
  if (['ANSWER_INFORMATION', 'SUMMARIZE_CONVERSATION'].includes(dominantGoal || '')) return 'ASK_INFORMATION';
  if (dominantGoal === 'EXECUTE_REQUEST') return 'REQUEST_ACTION';
  if (dominantGoal === 'RESOLVE_CURRENT_PROBLEM') return 'PROBLEM_RESOLUTION';
  if (dominantGoal === 'REPAIR_TRUST') return 'EXPRESS_DISSATISFACTION';
  if (['SUPPORT_PURCHASE_DECISION', 'CONFIRM_TRANSACTION', 'EXPLORE_PRODUCT_NEED'].includes(dominantGoal || '')) return 'PURCHASE_INTEREST';
  if (dominantGoal === 'PROVIDE_REQUESTED_ADVICE') {
    return modelIntent === 'EMOTIONAL_DISCLOSURE' ? 'EMOTIONAL_DISCLOSURE' : 'ASK_INFORMATION';
  }
  if (['INVITE_EMOTIONAL_SHARING', 'PROVIDE_EMOTIONAL_COMFORT', 'LISTEN_TO_VENTING'].includes(dominantGoal || '')) {
    return 'EMOTIONAL_DISCLOSURE';
  }
  if (dominantGoal === 'RESPECT_EMOTIONAL_SPACE') return 'REFUSE_SOLUTION';
  if (scenario === 'CASUAL_CHAT') {
    const rankedRefusal = asArray(payload.intentRanking).some((item) => {
      const record = asRecord(item);
      return normalizeModelPrimaryIntent(record.intent) === 'REFUSE_SOLUTION'
        && clampNumber(record.confidence, 0, 0, 1) >= 0.55;
    });
    if (rankedRefusal && (!modelIntent || ['CASUAL', 'RELATIONSHIP_CONTACT', 'EMOTIONAL_DISCLOSURE', 'UNKNOWN'].includes(modelIntent))) {
      return 'REFUSE_SOLUTION';
    }
  }
  return modelIntent;
}

function resolveModelTurnOverride(payload: ModelRecognitionPayload, primaryScenario: string | null) {
  const candidates = asArray(payload.intentRanking).map((item) => {
    const record = asRecord(item);
    return {
      scenario: normalizeModelScenario(record.scenario),
      intent: normalizeModelPrimaryIntent(record.intent),
      role: normalizeCode(record.role),
      scope: normalizeCode(record.scope),
      continuity: normalizeCode(record.continuity),
      confidence: clampNumber(record.confidence, 0, 0, 1),
      priority: clampNumber(record.priority, 0, 0, 5000),
    };
  }).filter((item) => item.scenario && item.intent);
  const primary = candidates.find((item) => item.role === 'PRIMARY') || candidates[0];
  const shifted = candidates
    .filter((item) => item.scenario !== primaryScenario && (item.continuity === 'SHIFTED' || item.scope === 'TURN'))
    .sort((a, b) => b.confidence - a.confidence || b.priority - a.priority)[0];
  if (!shifted) return null;
  if (shifted.continuity === 'SHIFTED') return shifted as { scenario: string; intent: string };
  if (primary?.continuity === 'CONTINUING' && shifted.confidence >= primary.confidence + 0.05) {
    return shifted as { scenario: string; intent: string };
  }
  return null;
}

function resolveModelTopicShift(
  payload: ModelRecognitionPayload,
  primaryScenario: string,
  turnOverride: { scenario: string; intent: string } | null,
) {
  if (turnOverride) return true;
  const ranked = asArray(payload.intentRanking).map((item) => asRecord(item));
  const primary = ranked.find((item) => normalizeCode(item.role) === 'PRIMARY') || ranked[0];
  const primaryContinuity = normalizeCode(primary?.continuity);
  if (primaryContinuity === 'SHIFTED') return true;
  const primaryScope = normalizeCode(primary?.scope);
  const hasContinuingOtherTask = ranked.some((item) =>
    normalizeModelScenario(item.scenario) !== primaryScenario
    && normalizeCode(item.continuity) === 'CONTINUING',
  );
  return hasContinuingOtherTask && (primaryScope === 'TURN' || primaryContinuity === 'NEW');
}

export function alignCustomerServiceConversationTaskStateWithModel(
  state: CustomerServiceHumanContext['conversationTaskState'],
  payload: ModelRecognitionPayload,
  scenario: string,
  intent: string,
  topicShift: boolean,
  latestMessage: string,
  stateTruth: CustomerServiceStateTruthSignal,
): CustomerServiceHumanContext['conversationTaskState'] {
  const taskSignal = stateTruth.task;
  if (taskSignal.relation === 'START_NEW') {
    return {
      ...state,
      currentTurnRelation: state.currentTurnRelation === 'NEW_REQUEST' ? 'NEW_REQUEST' : 'TOPIC_SHIFT',
      activeScenario: scenario,
      activeIntent: intent,
      activeTaskId: null,
      longHorizonStatus: 'ACTIVE',
    };
  }
  if (taskSignal.relation === 'CONTINUE_CURRENT') {
    return {
      ...state,
      currentTurnRelation: 'CONTINUATION',
      activeScenario: scenario,
      activeIntent: intent,
      activeTaskId: taskSignal.targetTaskId,
      longHorizonStatus: state.longHorizonStatus === 'WAITING_CUSTOMER' || state.longHorizonStatus === 'WAITING_INTERNAL'
        ? state.longHorizonStatus
        : 'ACTIVE',
    };
  }
  if (taskSignal.relation === 'RESUME_EXISTING') {
    return {
      ...state,
      currentTurnRelation: 'CONTINUATION',
      activeScenario: scenario,
      activeIntent: intent,
      status: state.status === 'NONE' || state.status === 'RESOLVED' ? 'IN_PROGRESS' : state.status,
      activeTaskId: taskSignal.targetTaskId,
      longHorizonStatus: 'REOPENED',
    };
  }
  if (taskSignal.relation === 'RESOLVE_CURRENT' || taskSignal.relation === 'ABANDON_CURRENT') {
    return {
      ...state,
      currentTurnRelation: 'RESOLUTION',
      activeScenario: scenario,
      activeIntent: intent,
      status: 'RESOLVED',
      pendingSlots: [],
      unresolvedGoals: [],
      responsibility: 'NONE',
      activeTaskId: taskSignal.targetTaskId,
      longHorizonStatus: taskSignal.relation === 'ABANDON_CURRENT' ? 'ABANDONED' : 'RESOLVED',
    };
  }

  // R1: intentRanking.continuity is an existing semantic signal. When it is
  // confidence/evidence-bound to the latest message it may correct lexical task
  // lifecycle heuristics, but it never targets a task id by itself.
  const modelContinuity = readEvidenceBoundModelTaskContinuity(payload, latestMessage);
  const dominantGoal = normalizeCode(asRecord(asRecord(payload.humanContext).dominantTurnGoal).key);
  if (modelContinuity === 'RESOLVED' && !STATE_SUBSTANTIVE_GOALS.has(dominantGoal as CustomerServiceTurnGoal['key'])) {
    return {
      ...state,
      currentTurnRelation: 'RESOLUTION',
      status: 'RESOLVED',
      pendingSlots: [],
      unresolvedGoals: [],
      responsibility: 'NONE',
      longHorizonStatus: 'RESOLVED',
    };
  }
  if (modelContinuity === 'CONTINUING' && ['TOPIC_SHIFT', 'RESOLUTION'].includes(state.currentTurnRelation)) {
    return {
      ...state,
      currentTurnRelation: 'CONTINUATION',
      longHorizonStatus: state.longHorizonStatus === 'REOPENED' ? 'REOPENED' : 'ACTIVE',
    };
  }
  // R1: lexical resolution is heuristic evidence only. A substantive current
  // operation cannot destructively close long-horizon state without a validated
  // stateTruth target or a compatible evidence-bound resolved semantic signal.
  if (state.currentTurnRelation === 'RESOLUTION'
    && STATE_SUBSTANTIVE_GOALS.has(dominantGoal as CustomerServiceTurnGoal['key'])
    && modelContinuity !== 'SHIFTED') {
    return {
      ...state,
      currentTurnRelation: 'CONTINUATION',
      longHorizonStatus: 'ACTIVE',
    };
  }
  if (modelContinuity === 'SHIFTED' || topicShift) {
    return {
      ...state,
      currentTurnRelation: 'TOPIC_SHIFT',
      activeScenario: scenario,
      activeIntent: intent,
      activeTaskId: null,
      longHorizonStatus: 'ACTIVE',
    };
  }
  if (dominantGoal === 'HANDLE_INFORMATION_BARRIER' && (state.pendingSlots.length || state.lastAssistantRequest)) {
    return {
      ...state,
      currentTurnRelation: 'INFORMATION_BARRIER',
      status: 'INTERNAL_PROCESSING',
      responsibility: 'INTERNAL',
    };
  }
  if (dominantGoal === 'PROCESS_PROVIDED_INFORMATION') {
    const dominantRecord = asRecord(asRecord(payload.humanContext).dominantTurnGoal);
    const dominantEvidence = stringArray(dominantRecord.evidence, 4);
    const evidenceBound = hasVerbatimCurrentTurnEvidence(dominantEvidence, latestMessage);
    const promoted = evidenceBound && !state.providedSlots.length && state.pendingSlots.length
      ? [{ ...state.pendingSlots[0], status: 'PROVIDED' as const, value: latestMessage.trim(), confidence: 0.9,
          evidence: ['TYPED_PROCESS_PROVIDED_INFORMATION'] }]
      : state.providedSlots;
    if (promoted.length) {
      return {
        ...state,
        currentTurnRelation: 'ANSWER_TO_ASSISTANT_REQUEST',
        status: 'READY_TO_ADVANCE',
        pendingSlots: state.pendingSlots.filter((slot) => !promoted.some((item) => item.key === slot.key)),
        providedSlots: promoted,
        requestResponseType: 'PROVIDED',
        responsibility: 'SHARED',
      };
    }
  }
  return state;
}

function readEvidenceBoundModelTaskContinuity(
  payload: ModelRecognitionPayload,
  latestMessage: string,
): typeof RECOGNITION_CONTINUITIES[number] | null {
  const ranked = asArray(payload.intentRanking).map((item) => asRecord(item));
  const primary = ranked.find((item) => normalizeCode(item.role) === 'PRIMARY') || ranked[0];
  if (!primary) return null;
  const continuity = normalizeEnum(primary.continuity, RECOGNITION_CONTINUITIES, null);
  const confidence = clampNumber(primary.confidence, 0, 0, 1);
  const evidence = stringArray(primary.evidence, 2);
  if (!continuity || confidence < 0.82 || !hasVerbatimCurrentTurnEvidence(evidence, latestMessage)) return null;
  return continuity;
}

function minimumRiskForScenario(scenario: string): CustomerServiceTopic['riskLevel'] {
  if (scenario === 'SECURITY_SENSITIVE') return 'CRITICAL';
  if (['SAFETY_SENSITIVE', 'COMPLAINT_ESCALATION'].includes(scenario)) return 'HIGH';
  if (['AFTER_SALE', 'REFUND_REQUEST', 'LOGISTICS_DELAY'].includes(scenario)) return 'MEDIUM';
  return 'LOW';
}

function normalizeKey(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9.-]/g, '').replace(/^-+|-+$/g, '');
  return normalized || '';
}


function normalizeCustomerConstraintSemanticKey(value: string) {
  let normalized = value;
  // State-owned task scoping is `constraint.<taskId>.<semanticKey>`. A model may
  // occasionally echo that already-scoped shape from history; peel only this
  // transport prefix (including accidental repeats), then return the semantic key.
  for (let i = 0; i < 4; i += 1) {
    const match = normalized.match(/^constraint\.[a-z0-9-]+\.(.+)$/);
    if (!match?.[1]) break;
    normalized = normalizeKey(match[1]);
  }
  return normalized;
}

function normalizeCategory(value: unknown, scenario: string) {
  const normalized = normalizeEnum(value, ['RELATIONSHIP', 'PRE_SALE', 'ORDER', 'LOGISTICS', 'AFTER_SALE', 'SAFETY', 'CUSTOMER_CONSTRAINT'] as const, null);
  if (normalized) return normalized;
  if (scenario === 'CASUAL_CHAT') return 'RELATIONSHIP';
  if (['PRODUCT_CONSULT', 'PRODUCT_COMPARE', 'PRICE_HESITATION'].includes(scenario)) return 'PRE_SALE';
  if (scenario === 'ORDER_STATUS') return 'ORDER';
  if (scenario === 'LOGISTICS_DELAY') return 'LOGISTICS';
  if (['AFTER_SALE', 'REFUND_REQUEST', 'COMPLAINT_ESCALATION'].includes(scenario)) return 'AFTER_SALE';
  return 'SAFETY';
}

function normalizeString(value: unknown, fallback: string, maxLength: number) {
  const normalized = String(value ?? '').trim();
  return (normalized || fallback).slice(0, maxLength);
}

function stringArray(value: unknown, limit: number, fallback: string[] = []) {
  const result = asArray(value).map((item) => String(item ?? '').trim()).filter(Boolean);
  return result.length ? [...new Set(result)].slice(0, limit) : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? Math.min(max, Math.max(min, normalized)) : fallback;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean))];
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function recognitionId(type: string, key: string, message: string) {
  let hash = 2166136261;
  const source = `${type}|${key}|${message}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${type.toLowerCase()}-${(hash >>> 0).toString(36)}`;
}

function typeLabel(type: string) {
  return ({ INTENT: '客户意图', EVENT: '业务事件', STATE: '当前状态', SIGNAL: '弱信号' } as Record<string, string>)[type] || type;
}
