import { Injectable } from '@nestjs/common';
import { CompileCustomerServiceSimulationDto } from '../simulation/dto/compile-simulation.dto';
import { canonicalIntentForScenario, inferConversationTaskState } from './customer-service-conversation-task-state';
import type {
  CustomerServiceHumanContext,
  CustomerServiceMessageUnderstanding,
  CustomerServicePrimaryMotive,
  CustomerServiceResponseAct,
  CustomerServiceTurnGoal,
} from './types/customer-service-message-understanding.type';

/**
 * Compatibility projection before Deep Recognition, and the conservative fallback when
 * that model is unavailable/invalid. It intentionally does not classify open-language
 * business semantics. Positive business scenario/intent/goal/focus authority belongs to
 * the evidence-bound Deep Recognition envelope. Deterministic pre-model logic is limited
 * to explicit structured overrides and Safety/Security hard floors.
 */
@Injectable()
export class CustomerServiceMessageUnderstandingService {
  understand(dto: CompileCustomerServiceSimulationDto): CustomerServiceMessageUnderstanding {
    const message = dto.message.trim();
    const manualScenario = normalizeCode(dto.scenario);
    const manualIntent = normalizeCode(dto.intent);
    const hardFloor = detectSafetySecurityHardFloor(message);
    const primaryScenario = manualScenario || hardFloor?.scenario || 'GENERAL_INQUIRY';
    const primaryIntent = canonicalIntentForScenario(
      primaryScenario,
      manualIntent || hardFloor?.intent || 'ASK_INFORMATION',
    );
    const riskLevel = normalizeRisk(dto.riskLevel) || hardFloor?.riskLevel || minimumRiskForScenario(primaryScenario);
    const conversationTaskState = inferConversationTaskState(dto, primaryScenario, primaryIntent);
    const humanContext = inferHumanContext({
      dto,
      message,
      normalized: message.toLowerCase(),
      scenario: primaryScenario,
      intent: primaryIntent,
      emotion: 'NEUTRAL',
      riskLevel,
      conversationTaskState,
    });
    const source = manualScenario || manualIntent || dto.riskLevel ? 'MANUAL' as const : 'HEURISTIC' as const;
    const evidence = hardFloor?.evidence || (source === 'MANUAL' ? ['STRUCTURED_OVERRIDE'] : ['NEUTRAL_PRE_MODEL_FALLBACK']);
    return {
      source,
      factOwnership: neutralFactOwnership(),
      primaryScenario,
      primaryIntent,
      riskLevel,
      emotion: 'NEUTRAL',
      topics: [{
        scenario: primaryScenario,
        intent: primaryIntent,
        riskLevel,
        priority: hardFloor ? 2000 : 0,
        confidence: hardFloor ? hardFloor.confidence : source === 'MANUAL' ? 1 : 0.25,
        evidence,
      }],
      intentRanking: [{
        key: `${primaryScenario.toLowerCase()}:${primaryIntent.toLowerCase()}`,
        name: `${primaryScenario} / ${primaryIntent}`,
        scenario: primaryScenario,
        intent: primaryIntent,
        role: 'PRIMARY',
        scope: 'TURN',
        continuity: 'NEW',
        confidence: hardFloor ? hardFloor.confidence : source === 'MANUAL' ? 1 : 0.25,
        priority: hardFloor ? 2000 : 0,
        evidence,
        reason: hardFloor ? 'Safety/Security deterministic hard floor.' : 'Neutral pre-model compatibility projection.',
        actionable: Boolean(hardFloor || source === 'MANUAL'),
      }],
      recognizedItems: [],
      recognitionModel: {
        attempted: false,
        status: 'NOT_REQUESTED',
        model: null,
        requestId: null,
        elapsedMs: 0,
        errorMessage: null,
      },
      humanContext,
      requiresHumanReview: riskLevel === 'HIGH' || riskLevel === 'CRITICAL',
      confidence: hardFloor ? hardFloor.confidence : source === 'MANUAL' ? 1 : 0.25,
      reasons: [
        `分类来源：${source}`,
        `兼容投影：${primaryScenario} / ${primaryIntent}`,
        hardFloor ? 'Safety/Security hard floor active.' : 'No positive open-language business semantics inferred before Deep Recognition.',
      ],
    };
  }
}

/**
 * Generic fallback context from already-typed/structured inputs only. The current
 * message is carried as opaque evidence for the model, never parsed here into a new
 * business goal, feedback delta, commercial opportunity, or relationship state.
 */
export function inferHumanContext(input: {
  dto: CompileCustomerServiceSimulationDto;
  message: string;
  normalized: string;
  scenario: string;
  intent: string;
  emotion: CustomerServiceMessageUnderstanding['emotion'];
  riskLevel: CustomerServiceMessageUnderstanding['riskLevel'];
  conversationTaskState: CustomerServiceHumanContext['conversationTaskState'];
}): CustomerServiceHumanContext {
  const service = isServiceScenario(input.scenario);
  const action = input.intent === 'REQUEST_ACTION' || input.intent === 'PROBLEM_RESOLUTION';
  const decision = input.intent === 'PURCHASE_INTEREST';
  const primaryMotive: CustomerServicePrimaryMotive = action ? 'ACTION_REQUEST'
    : decision ? 'PURCHASE_EXPLORATION' : 'INFORMATION_SEEKING';
  const goal = neutralGoal(input.scenario, input.intent, input.message);
  const requiredResponseActs: CustomerServiceResponseAct[] = action ? ['PRACTICAL_NEXT_STEP'] : ['DIRECT_ANSWER'];
  return {
    primaryMotive,
    secondaryMotives: [],
    mindset: 'NEUTRAL',
    relationshipState: 'FORMAL',
    conversationStance: service ? 'FORMAL_SERVICE' : 'FRIENDLY_SERVICE',
    commercialOpenness: 'UNKNOWN',
    commercialOpennessScore: 0,
    commercialStrategy: {
      stage: 'NO_COMMERCIAL_MOVE',
      objective: '在 Deep Recognition 不可用时保持保守中性，不制造商业推进。',
      discoveryTarget: '无',
      productMentionPolicy: 'PROHIBITED',
      transitionSignals: [],
      evidence: [],
      reason: 'Neutral fallback has no open-language business-semantic authority.',
    },
    statedNeeds: [],
    inferredNeeds: [],
    valueOpportunities: [],
    evidence: [],
    uncertainties: ['Deep Recognition 尚未提供可验证 typed semantic envelope。'],
    emotionalDisclosure: { detected: false, polarity: 'NONE', mode: 'NONE', confidence: 0, adviceRequested: false, evidence: [] },
    emotionStrategy: {
      posture: input.riskLevel === 'CRITICAL' || input.riskLevel === 'HIGH' ? 'CAUTIOUS_SERIOUS' : 'WARM_PROFESSIONAL',
      warmth: 50,
      playfulness: 0,
      validationPriority: 40,
      solutionPriority: 70,
      emojiPolicy: 'AVOID',
      relationshipDistance: 'FORMAL',
      guidance: ['优先完成当前已证明任务；未知语义不做推断。'],
      forbiddenTone: ['无依据承诺', '无依据商业推进'],
      reason: 'Structured neutral fallback.',
    },
    interactionStrategy: {
      phase: service ? 'SERVICE' : 'OPENING',
      firstMove: action ? 'SOLVE_CURRENT_ISSUE' : 'CLARIFY_NEED',
      commercialTiming: 'HOLD',
      reason: 'No positive open-language semantic authority in fallback.',
    },
    replyStrategy: {
      mode: input.riskLevel === 'CRITICAL' || input.riskLevel === 'HIGH' ? 'SAFE_BOUNDARY' : 'DIRECT_ANSWER',
      primaryMove: action ? '处理已结构化确认的当前任务。' : '在缺少 typed semantic envelope 时只给保守一般帮助或澄清。',
      secondaryMoves: [],
      continuation: 'WAIT_FOR_CUSTOMER',
      valueGoal: '避免因模型不可用而用词表伪造业务理解。',
      mustInclude: [],
      avoid: ['虚构业务事实', '从关键词重建业务意图', '无依据推荐或执行'],
      reason: 'Neutral compatibility fallback.',
    },
    semanticMoveBudget: {
      maxCoreMoves: 1,
      allowedMoves: ['仅执行结构化已知任务或给保守一般帮助'],
      forbiddenCombinations: ['未知语义 + 具体业务承诺', '未知语义 + 具体商品/状态事实'],
      reason: 'Fail closed on positive business semantics.',
    },
    dominantTurnGoal: goal,
    rankedTurnGoals: [goal],
    requiredTurnGoals: [goal],
    requiredResponseActs,
    conversationTaskState: input.conversationTaskState,
    dialogueObligation: neutralDialogueObligation(input.dto.conversationHistory || []),
    stateTruthSignal: {
      authority: 'STATE_MUTATION_EVIDENCE_ONLY',
      task: { relation: 'NONE', targetTaskId: null, evidence: '', confidence: 0 },
      memory: { action: 'NONE', targetMemoryId: null, replacementValue: null, evidence: '', confidence: 0 },
      entity: { action: 'NONE', targetEntityId: null, replacementValue: null, evidence: '', confidence: 0 },
    },
  };
}

/**
 * Structural routing diagnostic only. It may decide whether Deep Recognition is worth
 * calling more urgently, but it must never produce scenario/intent/goal authority.
 */
export type CustomerServicePragmaticAnalysis = {
  speechAct: 'UNKNOWN';
  isQuestion: boolean;
  rhetoricalOrSarcastic: boolean;
  multiClause: boolean;
  contextDependent: boolean;
  lowInformation: boolean;
  negatesAction: boolean;
  userCorrection: boolean;
  requiresDeepRecognition: boolean;
};

export function analyzeCustomerServicePragmatics(message: string): CustomerServicePragmaticAnalysis {
  const text = String(message || '').trim();
  const compact = text.replace(/\s+/g, '');
  return {
    speechAct: 'UNKNOWN',
    isQuestion: /[?？]$/.test(text),
    rhetoricalOrSarcastic: false,
    multiClause: false,
    contextDependent: false,
    lowInformation: compact.length <= 1,
    negatesAction: false,
    userCorrection: false,
    requiresDeepRecognition: true,
  };
}

function neutralGoal(scenario: string, intent: string, message: string): CustomerServiceTurnGoal {
  const isSafety = ['SAFETY_SENSITIVE', 'SECURITY_SENSITIVE'].includes(scenario);
  return {
    key: isSafety || intent === 'ASK_INFORMATION' ? 'ANSWER_INFORMATION' : intent === 'REQUEST_ACTION' ? 'EXECUTE_REQUEST' : 'CLARIFY_NEED',
    requestedContributionKind: intent === 'REQUEST_ACTION' ? 'ACTION' : 'INFORMATION',
    requestedEvidenceScope: 'NOT_APPLICABLE',
    requestedDecisionMode: 'NOT_APPLICABLE',
    requestedAnswerFocus: 'NOT_APPLICABLE',
    requestedSpecificity: 'NOT_APPLICABLE',
    name: isSafety ? '安全边界回应' : '保守中性处理',
    priority: isSafety ? 1000 : 0,
    confidence: isSafety ? 0.98 : 0.25,
    evidence: isSafety && message ? [message] : [],
    reason: isSafety ? 'Safety/Security deterministic hard floor.' : 'Neutral model-unavailable fallback.',
    responseRequirement: isSafety ? '遵守安全边界并提供安全替代。' : '不要把 fallback 词面判断当成业务语义 Authority。',
    source: isSafety ? 'SIGNAL' : 'STATE',
    deferred: false,
  };
}

function neutralDialogueObligation(history: CompileCustomerServiceSimulationDto['conversationHistory']) {
  const previousAssistantText = [...(history || [])].reverse().find((item) => item.role === 'ASSISTANT')?.content?.trim() || '';
  return {
    previousAssistantMove: 'UNKNOWN' as const,
    userFeedback: 'UNCLEAR' as const,
    feedbackHandlingMode: 'NONE' as const,
    acknowledgementRequired: false,
    requestedDeltas: [],
    feedbackTargetTurnNo: previousAssistantText ? Math.max(1, (history || []).length) : null,
    strategyChangeRequired: false,
    rejectedMove: null,
    correctionTarget: null,
    unresolvedNeed: null,
    repairObligation: false,
    forbiddenRepeatedMoves: [],
    acceptedConversationStyle: [],
    currentResponseObligation: '准确回应客户最新消息，并延续仍然有效的结构化上下文',
    evidence: [],
    confidence: previousAssistantText ? 0.2 : 0,
    source: 'STATE' as const,
  };
}

function detectSafetySecurityHardFloor(message: string) {
  const text = String(message || '').trim();
  if (!text) return null;
  const credential = /(?:验证码|密码|cookie|token|登录令牌)/iu;
  const credentialTransfer = /(?:把|将|发|发送|提供|交给|给|贴|上传)[^。！？!?]{0,18}(?:验证码|密码|cookie|token|登录令牌)|(?:验证码|密码|cookie|token|登录令牌)[^。！？!?]{0,18}(?:发给|发送给|提供给|交给|给你|发你|贴给|上传给)/iu;
  const delegatedLogin = /(?:帮我|替我|直接帮我|给我)(?:直接)?(?:登录|登入|操作账号|代操作)/iu;
  if ((credential.test(text) && credentialTransfer.test(text)) || delegatedLogin.test(text)) {
    return { scenario: 'SECURITY_SENSITIVE', intent: 'REQUEST_ACTION', riskLevel: 'CRITICAL' as const, confidence: 0.99, evidence: ['SECURITY_SENSITIVE_HARD_FLOOR'] };
  }
  // Safety hard floor is deliberately narrow: it only protects immediate physical-harm
  // indicators. Domain-specific medical/business interpretation remains model-owned.
  if (/(?:冒烟|起火|着火|漏电|触电)/iu.test(text)) {
    return { scenario: 'SAFETY_SENSITIVE', intent: 'ASK_INFORMATION', riskLevel: 'HIGH' as const, confidence: 0.98, evidence: ['SAFETY_SENSITIVE_HARD_FLOOR'] };
  }
  return null;
}

function neutralFactOwnership(): CustomerServiceMessageUnderstanding['factOwnership'] {
  return {
    authority: 'MESSAGE_UNDERSTANDING_FACT_OWNERSHIP',
    scope: 'NONE',
    confidence: 0,
    evidence: [],
    reason: 'Pre-model fallback has no positive merchant fact-ownership authority.',
    namedOfferingReferent: {
      authority: 'MESSAGE_UNDERSTANDING_NAMED_OFFERING_REFERENT',
      status: 'NONE',
      source: 'NONE',
      surface: null,
      resolvedGroundingIds: [],
    },
  };
}

function minimumRiskForScenario(scenario: string): CustomerServiceMessageUnderstanding['riskLevel'] {
  if (scenario === 'SECURITY_SENSITIVE') return 'CRITICAL';
  if (scenario === 'SAFETY_SENSITIVE' || scenario === 'COMPLAINT_ESCALATION') return 'HIGH';
  if (['AFTER_SALE', 'REFUND_REQUEST', 'LOGISTICS_DELAY'].includes(scenario)) return 'MEDIUM';
  return 'LOW';
}

function normalizeRisk(value: unknown): CustomerServiceMessageUnderstanding['riskLevel'] | null {
  const normalized = String(value || '').trim().toUpperCase();
  return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(normalized)
    ? normalized as CustomerServiceMessageUnderstanding['riskLevel'] : null;
}

function normalizeCode(value: unknown) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || null;
}

function isServiceScenario(scenario: string) {
  return ['COMPLAINT_ESCALATION', 'REFUND_REQUEST', 'AFTER_SALE', 'LOGISTICS_DELAY', 'ORDER_STATUS', 'SAFETY_SENSITIVE', 'SECURITY_SENSITIVE', 'APPOINTMENT'].includes(scenario);
}
