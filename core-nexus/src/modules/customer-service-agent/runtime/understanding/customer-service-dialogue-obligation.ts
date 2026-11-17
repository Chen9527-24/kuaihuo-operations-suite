import type { CompileCustomerServiceSimulationDto } from '../simulation/dto/compile-simulation.dto';
import type {
  CustomerServiceAssistantMove,
  CustomerServiceDialogueObligation,
  CustomerServiceFeedbackHandlingMode,
  CustomerServiceFeedbackType,
  CustomerServiceRequestedDelta,
} from './types/customer-service-message-understanding.type';

type ConversationHistory = CompileCustomerServiceSimulationDto['conversationHistory'];

export function inferCustomerServiceDialogueObligation(
  _message: string,
  history: ConversationHistory = [],
): CustomerServiceDialogueObligation {
  const previousAssistantText = [...(history ?? [])]
    .reverse()
    .find((item) => item.role === 'ASSISTANT')?.content?.trim() || '';
  // Model-unavailable fallback is deliberately neutral. Open-language reception,
  // rejection, correction, style delta, topic-return and stop semantics belong to
  // Deep Recognition's typed dialogueFeedbackSignal, not a parallel phrase parser.
  return {
    previousAssistantMove: 'UNKNOWN',
    userFeedback: 'UNCLEAR',
    feedbackHandlingMode: 'NONE',
    acknowledgementRequired: false,
    requestedDeltas: [],
    feedbackTargetTurnNo: previousAssistantText ? Math.max(1, history.length) : null,
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
    source: 'STATE',
  };
}

/**
 * H0.2-C Final Reality Closure.
 *
 * The deterministic DialogueObligation remains the single final Authority for
 * current-turn feedback. Deep recognition may contribute one bounded semantic
 * signal when the latest user turn evaluates the immediately previous assistant
 * response (for example: tried it and it did not solve the problem). The signal
 * cannot create a second planner: it is evidence-checked here and compiled back
 * into the existing DialogueObligation contract.
 *
 * This deliberately avoids language/industry/test-utterance rules. The model is
 * asked to do the semantic recognition in the deep-recognition call that already
 * exists; this function only validates and merges that signal.
 */
export function reconcileCustomerServiceDialogueObligationWithModelSignal(
  current: CustomerServiceDialogueObligation,
  rawSignal: unknown,
  input: {
    message: string;
    previousAssistantText?: string | null;
    currentTurnGoalEvidence?: string[] | null;
    currentTurnGoalKey?: string | null;
  },
): CustomerServiceDialogueObligation {
  const signal = readDialogueFeedbackSignal(rawSignal);
  if (!signal || signal.confidence < 0.72) return current;

  const previousAssistantText = String(input.previousAssistantText || '').trim();
  const hasPriorAssistant = Boolean(previousAssistantText);
  const signalHasSemanticDelta = signal.userFeedback !== 'UNCLEAR'
    || signal.previousAdviceOutcome !== 'NONE'
    || signal.requestedDeltas.length > 0
    || Boolean(signal.correctionTarget);
  const signalEvidenceValid = !signalHasSemanticDelta
    || Boolean(signal.evidence && containsEvidence(input.message, signal.evidence));

  // Successful Deep Recognition owns open-language feedback semantics. Invalid
  // semantic evidence fails closed to neutral rather than reviving lexical fallback.
  let modelFeedback: CustomerServiceFeedbackType = signalEvidenceValid ? signal.userFeedback : 'UNCLEAR';
  let modelDeltas = signalEvidenceValid ? [...signal.requestedDeltas] : [];
  let correctionTarget = signalEvidenceValid ? signal.correctionTarget : null;
  let previousAdviceOutcome = signalEvidenceValid ? signal.previousAdviceOutcome : 'NONE';

  if (!hasPriorAssistant) {
    // No previous assistant contribution exists to accept/reject/correct. Current-turn
    // presentation/boundary deltas may still apply when their evidence is valid.
    modelFeedback = 'UNCLEAR';
    previousAdviceOutcome = 'NONE';
    correctionTarget = null;
  }

  const receptionQuote = (key: keyof DialogueFeedbackSignal['receptionEvidence']) => {
    const quote = signal.receptionEvidence[key];
    return quote && containsEvidence(input.message, quote)
      && (input.currentTurnGoalKey === 'CLOSE_CONVERSATION'
        || !(input.currentTurnGoalEvidence || []).some((goal) => evidenceSpansOverlap(quote, goal)))
      ? quote : '';
  };
  const acceptedQuote = receptionQuote('accepted');
  const insufficientQuote = receptionQuote('insufficient');
  if (hasPriorAssistant && ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'INSUFFICIENT'].includes(modelFeedback)) {
    modelFeedback = acceptedQuote && insufficientQuote && !evidenceSpansOverlap(acceptedQuote, insufficientQuote)
      ? 'PARTIALLY_ACCEPTED' : acceptedQuote ? 'ACCEPTED' : insufficientQuote ? 'INSUFFICIENT' : 'UNCLEAR';
  } else if (hasPriorAssistant && modelFeedback === 'REJECTED' && !receptionQuote('rejected')) {
    modelFeedback = 'UNCLEAR';
  } else if (hasPriorAssistant && modelFeedback === 'CORRECTED' && !receptionQuote('corrected')) {
    modelFeedback = 'UNCLEAR';
  }

  const currentTurnGoalEvidence = (input.currentTurnGoalEvidence || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const feedbackOwnsCurrentTurnGoal = signal.evidence
    ? currentTurnGoalEvidence.some((item) => evidenceSpansOverlap(signal.evidence, item))
    : false;
  modelDeltas = modelDeltas.filter((delta) => (
    delta !== 'ANSWER_PREVIOUS_QUESTION'
    || currentTurnGoalEvidence.length === 0
    || feedbackOwnsCurrentTurnGoal
  ));

  if (previousAdviceOutcome === 'TRIED_INEFFECTIVE') {
    if (['UNCLEAR', 'ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(modelFeedback)) modelFeedback = 'INSUFFICIENT';
    if (!modelDeltas.includes('DIFFERENT_APPROACH')) modelDeltas.push('DIFFERENT_APPROACH');
  } else if (previousAdviceOutcome === 'TRIED_PARTIAL' && modelFeedback === 'UNCLEAR') {
    modelFeedback = 'PARTIALLY_ACCEPTED';
  } else if (previousAdviceOutcome === 'TRIED_EFFECTIVE' && modelFeedback === 'UNCLEAR') {
    modelFeedback = 'ACCEPTED';
  }

  const requestedDeltas = [...new Set(modelDeltas)];
  const feedbackHandlingMode = inferFeedbackHandlingMode(modelFeedback);
  const negativeFeedback = ['REJECTED', 'CORRECTED', 'ESCALATED'].includes(modelFeedback);
  const finalCorrectionTarget = negativeFeedback ? correctionTarget || 'CONTENT' : null;
  const strategyChangeRequired = requiresDialogueStrategyChange(modelFeedback, requestedDeltas, []);
  const acknowledgementRequired = feedbackHandlingMode === 'TRUST_REPAIR';
  const repairObligation = strategyChangeRequired && Boolean(hasPriorAssistant || finalCorrectionTarget);
  const unresolvedNeed = previousAdviceOutcome === 'TRIED_INEFFECTIVE'
    ? '上一轮建议已被客户实际尝试且未解决当前问题，需要换一个实质不同的方向继续处理'
    : null;
  const evidence = signalEvidenceValid && signal.evidence
    ? [`深度识别确认当前反馈/交互变化的逐字证据：${signal.evidence}`]
    : [];

  return {
    ...current,
    userFeedback: modelFeedback,
    feedbackHandlingMode,
    acknowledgementRequired,
    requestedDeltas,
    strategyChangeRequired,
    // Open-language rejection semantics are already represented by modelFeedback and
    // correctionTarget. Do not infer a hidden rejected move by reparsing prior prose.
    rejectedMove: null,
    correctionTarget: finalCorrectionTarget,
    unresolvedNeed,
    repairObligation,
    forbiddenRepeatedMoves: [],
    acceptedConversationStyle: [],
    currentResponseObligation: buildResponseObligation({
      repairObligation,
      feedbackHandlingMode,
      acknowledgementRequired,
      unresolvedNeed,
      correctionTarget: finalCorrectionTarget,
      forbiddenRepeatedMoves: [],
    }),
    evidence,
    confidence: signal.confidence,
    source: 'MODEL',
  };
}

/**
 * Returns the already-validated verbatim evidence owned by the existing
 * DialogueFeedbackSignal. This is evidence projection only: it does not infer
 * feedback, create a goal, or decide whether the turn should close.
 */
export function resolveCustomerServiceDialogueFeedbackEvidence(
  rawSignal: unknown,
  message: string,
) {
  const signal = readDialogueFeedbackSignal(rawSignal);
  if (!signal || signal.confidence < 0.72) return null;
  return signal.evidence && containsEvidence(message, signal.evidence)
    ? signal.evidence
    : null;
}

type DialogueFeedbackSignal = {
  userFeedback: CustomerServiceFeedbackType;
  previousAdviceOutcome: 'NONE' | 'TRIED_EFFECTIVE' | 'TRIED_PARTIAL' | 'TRIED_INEFFECTIVE';
  requestedDeltas: CustomerServiceRequestedDelta[];
  correctionTarget: CustomerServiceDialogueObligation['correctionTarget'];
  evidence: string;
  receptionEvidence: Record<'accepted' | 'insufficient' | 'rejected' | 'corrected', string>;
  confidence: number;
};

function readDialogueFeedbackSignal(value: unknown): DialogueFeedbackSignal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const feedbackValues: CustomerServiceFeedbackType[] = [
    'ACCEPTED', 'PARTIALLY_ACCEPTED', 'INSUFFICIENT', 'REJECTED', 'CORRECTED', 'ESCALATED', 'WITHDRAWN', 'UNCLEAR',
  ];
  const outcomeValues: DialogueFeedbackSignal['previousAdviceOutcome'][] = [
    'NONE', 'TRIED_EFFECTIVE', 'TRIED_PARTIAL', 'TRIED_INEFFECTIVE',
  ];
  const deltaValues: CustomerServiceRequestedDelta[] = [
    'DEEPER', 'MORE_SPECIFIC', 'MORE_DETAILED', 'WARMER', 'LESS_WARM', 'LESS_FORMAL', 'MORE_DIRECT', 'SHORTER',
    'DIFFERENT_APPROACH', 'ANOTHER_OPTION', 'NO_SPECIFIC_RECOMMENDATION', 'HUMOR_OK', 'NO_HUMOR',
    'NO_QUESTIONS', 'NO_ADVICE', 'LISTEN_ONLY',
    'ANSWER_PREVIOUS_QUESTION', 'RETURN_TO_PREVIOUS_TOPIC', 'STOP_CURRENT_TOPIC',
  ];
  const correctionTargets: NonNullable<CustomerServiceDialogueObligation['correctionTarget']>[] = [
    'CONTENT', 'TONE', 'WORDING', 'INTERACTION', 'BUSINESS_ACTION',
  ];
  const userFeedback = feedbackValues.includes(record.userFeedback as CustomerServiceFeedbackType)
    ? record.userFeedback as CustomerServiceFeedbackType
    : 'UNCLEAR';
  const previousAdviceOutcome = outcomeValues.includes(record.previousAdviceOutcome as DialogueFeedbackSignal['previousAdviceOutcome'])
    ? record.previousAdviceOutcome as DialogueFeedbackSignal['previousAdviceOutcome']
    : 'NONE';
  const requestedDeltas = Array.isArray(record.requestedDeltas)
    ? [...new Set(record.requestedDeltas.filter((item): item is CustomerServiceRequestedDelta => deltaValues.includes(item as CustomerServiceRequestedDelta)))].slice(0, 3)
    : [];
  const correctionTarget = correctionTargets.includes(record.correctionTarget as NonNullable<CustomerServiceDialogueObligation['correctionTarget']>)
    ? record.correctionTarget as NonNullable<CustomerServiceDialogueObligation['correctionTarget']>
    : null;
  const evidence = typeof record.evidence === 'string' ? record.evidence.trim().slice(0, 160) : '';
  const confidenceRaw = Number(record.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;
  if (userFeedback === 'UNCLEAR' && previousAdviceOutcome === 'NONE' && requestedDeltas.length === 0) return null;
  const rawReception = record.receptionEvidence && typeof record.receptionEvidence === 'object'
    ? record.receptionEvidence as Record<string, unknown> : {};
  const quote = (key: string) => typeof rawReception[key] === 'string' ? String(rawReception[key]).trim().slice(0, 160) : '';
  const receptionEvidence = { accepted: quote('accepted'), insufficient: quote('insufficient'),
    rejected: quote('rejected'), corrected: quote('corrected') };
  return { userFeedback, previousAdviceOutcome, requestedDeltas, correctionTarget, evidence, receptionEvidence, confidence };
}

function inferFeedbackHandlingMode(
  feedback: CustomerServiceFeedbackType,
): CustomerServiceFeedbackHandlingMode {
  if (feedback === 'INSUFFICIENT' || feedback === 'PARTIALLY_ACCEPTED') return 'REFINE';
  if (feedback === 'CORRECTED') return 'CORRECT';
  if (feedback === 'REJECTED') return 'BOUNDARY';
  if (feedback === 'WITHDRAWN') return 'WITHDRAW';
  if (feedback === 'ESCALATED') return 'TRUST_REPAIR';
  return 'NONE';
}

function requiresDialogueStrategyChange(
  feedback: CustomerServiceFeedbackType,
  requestedDeltas: CustomerServiceRequestedDelta[],
  forbiddenRepeatedMoves: CustomerServiceAssistantMove[],
) {
  if (['REJECTED', 'CORRECTED', 'ESCALATED', 'WITHDRAWN'].includes(feedback)) return true;
  if (forbiddenRepeatedMoves.length > 0) return true;
  const strategyDeltas = new Set<CustomerServiceRequestedDelta>([
    'WARMER', 'LESS_FORMAL', 'MORE_DIRECT', 'SHORTER', 'DIFFERENT_APPROACH', 'ANOTHER_OPTION',
    'NO_QUESTIONS', 'NO_ADVICE', 'LISTEN_ONLY', 'ANSWER_PREVIOUS_QUESTION',
    'RETURN_TO_PREVIOUS_TOPIC', 'STOP_CURRENT_TOPIC',
  ]);
  return requestedDeltas.some((delta) => strategyDeltas.has(delta));
}

function containsEvidence(message: string, evidence: string) {
  const normalize = (value: string) => value.replace(/\s+/g, '').trim().toLowerCase();
  const source = normalize(message);
  const quote = normalize(evidence);
  return quote.length >= 2 && source.includes(quote);
}

function evidenceSpansOverlap(left: string, right: string) {
  const normalize = (value: string) => value.replace(/\s+/g, '').trim().toLowerCase();
  const a = normalize(left);
  const b = normalize(right);
  return a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a));
}

export function hasDialogueRepairSignal(_message: string) {
  // Retained only as a compatibility symbol. It has no open-language Authority.
  return false;
}

export function inheritPersistentDialogueBoundaries(
  current: CustomerServiceDialogueObligation,
  previous: CustomerServiceDialogueObligation | null | undefined,
  _message: string,
  currentTurnRelation: string,
): CustomerServiceDialogueObligation {
  if (!previous || previous.feedbackHandlingMode !== 'BOUNDARY') return current;
  if (['TOPIC_SHIFT', 'RESOLUTION'].includes(currentTurnRelation)) return current;
  if (current.source === 'MODEL' || current.strategyChangeRequired) return current;
  return {
    ...current,
    feedbackHandlingMode: 'BOUNDARY',
    requestedDeltas: [...previous.requestedDeltas],
    strategyChangeRequired: true,
    rejectedMove: previous.rejectedMove,
    correctionTarget: previous.correctionTarget,
    unresolvedNeed: previous.unresolvedNeed,
    forbiddenRepeatedMoves: [...previous.forbiddenRepeatedMoves],
    acceptedConversationStyle: [...previous.acceptedConversationStyle],
    currentResponseObligation: previous.currentResponseObligation,
    evidence: [...previous.evidence],
    confidence: previous.confidence,
    source: 'STATE',
  };
}


export function inferAssistantMove(_text: string): CustomerServiceAssistantMove {
  // Compatibility-only diagnostic symbol. Runtime semantics must come from the
  // typed Interaction/Act/state contracts, never from re-parsing assistant prose.
  return 'UNKNOWN';
}

function buildResponseObligation(input: {
  repairObligation: boolean;
  feedbackHandlingMode: CustomerServiceFeedbackHandlingMode;
  acknowledgementRequired: boolean;
  unresolvedNeed: string | null;
  correctionTarget: CustomerServiceDialogueObligation['correctionTarget'];
  forbiddenRepeatedMoves: CustomerServiceAssistantMove[];
}) {
  const handlingRequirement = input.feedbackHandlingMode === 'REFINE'
    ? '静默落实客户要求的强度或表达变化；直接给出改进后的内容，不评价上一轮回复，不外显调整过程'
    : input.feedbackHandlingMode === 'CORRECT'
      ? '立即按客户澄清后的正确理解回应；不做模型式自我复盘'
      : input.feedbackHandlingMode === 'BOUNDARY'
        ? '立即停止客户拒绝的回复动作，并在后续相关轮次持续遵守'
        : input.feedbackHandlingMode === 'WITHDRAW'
          ? '停止当前话题或动作，不追加追问、分析或建议'
          : input.feedbackHandlingMode === 'TRUST_REPAIR'
            ? '用与具体事实相关的自然表达承担服务过失，然后立即完成尚未满足的请求；不得使用模板化自我纠偏话术'
            : null;
  const parts = [
    input.repairObligation ? handlingRequirement : null,
    input.acknowledgementRequired ? '本轮需要承担明确服务过失，但承认必须对应具体事实且只占一句' : null,
    input.unresolvedNeed ? `完成客户尚未满足的显性需求：${input.unresolvedNeed}` : null,
    input.correctionTarget ? `优先修复客户指出的${correctionTargetName(input.correctionTarget)}问题` : null,
    input.forbiddenRepeatedMoves.length
      ? `不得重复已被拒绝的动作：${input.forbiddenRepeatedMoves.join('、')}`
      : null,
  ].filter(Boolean);
  return parts.join('；') || '准确回应客户最新消息，并延续仍然有效的上下文';
}

function correctionTargetName(target: NonNullable<CustomerServiceDialogueObligation['correctionTarget']>) {
  return ({ CONTENT: '内容理解', TONE: '语气', WORDING: '措辞', INTERACTION: '交互方式', BUSINESS_ACTION: '业务动作' } as const)[target];
}
